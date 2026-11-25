import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  taskDraftSchema,
  taskListQuerySchema,
  taskUpdateSchema,
  uuidSchema,
  versionQuerySchema,
  type Task,
  type TaskListResponse,
} from "@focus/contracts";
import { DomainError } from "../../common/domain-error";
import type { AuthContext } from "../auth/auth-context";
import {
  TASK_REPOSITORY,
  type MutationResult,
  type TaskCursor,
  type TaskFilters,
  type TaskPatch,
  type TaskRepository,
} from "./task.repository";

type Issue = { readonly path: readonly (string | number)[]; readonly message: string };

// Les erreurs de Zod deviennent un `detail` lisible (diagnostic d'entrée) ; le
// filtre global les transforme en 400 `VALIDATION_FAILED`. Les refus métier, eux,
// passent par `DomainError` : clé i18n, jamais de phrase (AGENTS §2).
export function describeIssues(issues: readonly Issue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.join(".");
    return `${path.length > 0 ? path : "body"}: ${issue.message}`;
  });
}

// Le curseur transporte la clé de tri de la dernière tâche vue, pas un rang :
// si la liste change entre deux pages (insertion, réordonnancement), aucune
// tâche n'est sautée ni répétée.
export function encodeCursor(task: Task): string {
  return Buffer.from(JSON.stringify({ sortOrder: task.sortOrder, id: task.id }), "utf8").toString(
    "base64url",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// `If-Match` accepte `3`, `"3"` et `W/"3"` : la comparaison se fait sur la
// version numérique, jamais sur la forme de l'en-tête.
function parseIfMatch(ifMatch: string | undefined): number | undefined {
  if (ifMatch === undefined) {
    return undefined;
  }
  const match = /^(?:W\/)?"?([0-9]+)"?$/.exec(ifMatch.trim());
  if (match === null) {
    throw new DomainError("request.invalid_field", { field: "If-Match" });
  }
  return Number(match[1]);
}

// Provenance de la version attendue : elle décide du statut en cas d'échec.
type VersionSource = "payload" | "if-match";

type ExpectedVersion = {
  readonly version: number;
  readonly source: VersionSource;
};

// La version attendue peut venir du corps, de la query ou de l'en-tête
// `If-Match` ; sans elle, aucun contrôle optimiste n'est possible → 400
// (jamais un écrasement silencieux). Le corps gagne sur l'en-tête s'il en
// porte une : c'est la forme la plus explicite.
function resolveExpectedVersion(
  fromPayload: number | undefined,
  ifMatch: string | undefined,
): ExpectedVersion {
  if (fromPayload !== undefined) {
    return { version: fromPayload, source: "payload" };
  }
  const fromHeader = parseIfMatch(ifMatch);
  if (fromHeader !== undefined) {
    return { version: fromHeader, source: "if-match" };
  }
  throw new DomainError("request.missing_version");
}

function decodeCursor(cursor: string): TaskCursor {
  const invalid = new DomainError("request.invalid_cursor");

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid;
  }
  if (!isRecord(decoded)) {
    throw invalid;
  }

  const sortOrder = decoded.sortOrder;
  const parsedId = uuidSchema.safeParse(decoded.id);
  if (typeof sortOrder !== "string" || sortOrder.length === 0 || !parsedId.success) {
    throw invalid;
  }

  return { sortOrder, id: parsedId.data };
}

@Injectable()
export class TasksService {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}

  async create(auth: AuthContext, rawBody: unknown): Promise<Task> {
    const parsed = taskDraftSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    return this.tasks.create(parsed.data, auth.workspaceId);
  }

  async findById(auth: AuthContext, rawId: string): Promise<Task> {
    const id = this.parseId(rawId);
    const task = await this.tasks.findById(id, auth.workspaceId);
    if (task === undefined) {
      throw new DomainError("task.not_found");
    }
    return task;
  }

  private parseId(rawId: string): string {
    const parsedId = uuidSchema.safeParse(rawId);
    if (!parsedId.success) {
      throw new DomainError("request.invalid_field", { field: "id" });
    }
    return parsedId.data;
  }

  private applyMutation(result: MutationResult, source: VersionSource): Task {
    if (result.status === "not_found") {
      throw new DomainError("task.not_found");
    }
    if (result.status === "conflict") {
      const params = { currentVersion: result.currentVersion };
      // Un `If-Match` non satisfait est une précondition échouée (412,
      // RFC 9110 §13.1.1) ; une version passée dans le corps ou la query est
      // un conflit applicatif (409). Le code `CONFLICT_VERSION` est identique.
      if (source === "if-match") {
        throw new DomainError("task.version_precondition_failed", params);
      }
      throw new DomainError("task.version_mismatch", params);
    }
    return result.task;
  }

  async update(
    auth: AuthContext,
    rawId: string,
    rawBody: unknown,
    ifMatch: string | undefined,
  ): Promise<Task> {
    const id = this.parseId(rawId);
    const parsed = taskUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const { version, ...fields } = parsed.data;
    const expected = resolveExpectedVersion(version, ifMatch);
    // `exactOptionalPropertyTypes` : chaque clé absente est omise du patch.
    const patch: TaskPatch = {
      ...(fields.title === undefined ? {} : { title: fields.title }),
      ...(fields.description === undefined ? {} : { description: fields.description }),
      ...(fields.projectId === undefined ? {} : { projectId: fields.projectId }),
      ...(fields.dueDate === undefined ? {} : { dueDate: fields.dueDate }),
      ...(fields.priority === undefined ? {} : { priority: fields.priority }),
      ...(fields.tagIds === undefined ? {} : { tagIds: fields.tagIds }),
      ...(fields.status === undefined ? {} : { status: fields.status }),
    };

    if (Object.keys(patch).length === 0) {
      throw new DomainError("request.empty_patch");
    }

    return this.applyMutation(
      await this.tasks.update(id, auth.workspaceId, patch, expected.version),
      expected.source,
    );
  }

  async remove(
    auth: AuthContext,
    rawId: string,
    rawQuery: unknown,
    ifMatch: string | undefined,
  ): Promise<void> {
    const id = this.parseId(rawId);
    const parsed = versionQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const expected = resolveExpectedVersion(parsed.data.version, ifMatch);
    this.applyMutation(
      await this.tasks.remove(id, auth.workspaceId, expected.version),
      expected.source,
    );
  }

  async list(auth: AuthContext, rawQuery: unknown): Promise<TaskListResponse> {
    const parsed = taskListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const { cursor, limit, status, projectId } = parsed.data;
    // `exactOptionalPropertyTypes` : une clé optionnelle ne peut pas valoir
    // `undefined`, elle est donc omise quand le filtre est absent.
    const filters: TaskFilters = {
      ...(status === undefined ? {} : { status }),
      ...(projectId === undefined ? {} : { projectId }),
    };
    const after = cursor === undefined ? undefined : decodeCursor(cursor);

    const page = await this.tasks.list(
      filters,
      auth.workspaceId,
      after === undefined ? { limit } : { limit, after },
    );
    const last = page.items.at(-1);

    return {
      items: [...page.items],
      nextCursor: page.hasMore && last !== undefined ? encodeCursor(last) : null,
    };
  }
}
