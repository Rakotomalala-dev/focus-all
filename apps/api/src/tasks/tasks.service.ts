import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  taskDraftSchema,
  taskListQuerySchema,
  uuidSchema,
  type Task,
  type TaskListResponse,
} from "@focus/contracts";
import { DEV_WORKSPACE_ID } from "./dev-workspace";
import {
  TASK_REPOSITORY,
  type TaskCursor,
  type TaskFilters,
  type TaskRepository,
} from "./task.repository";

type Issue = { readonly path: readonly (string | number)[]; readonly message: string };

// Les erreurs de Zod deviennent un `detail` lisible ; le filtre global les
// transforme en 400 `VALIDATION_FAILED` au format problem+json.
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

function decodeCursor(cursor: string): TaskCursor {
  const invalid = new BadRequestException(["cursor: curseur invalide"]);

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

  async create(rawBody: unknown): Promise<Task> {
    const parsed = taskDraftSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    return this.tasks.create(parsed.data, DEV_WORKSPACE_ID);
  }

  async findById(rawId: string): Promise<Task> {
    const parsedId = uuidSchema.safeParse(rawId);
    if (!parsedId.success) {
      throw new BadRequestException(["id: identifiant invalide"]);
    }
    const task = await this.tasks.findById(parsedId.data, DEV_WORKSPACE_ID);
    if (task === undefined) {
      throw new NotFoundException("Tâche introuvable");
    }
    return task;
  }

  async list(rawQuery: unknown): Promise<TaskListResponse> {
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
      DEV_WORKSPACE_ID,
      after === undefined ? { limit } : { limit, after },
    );
    const last = page.items.at(-1);

    return {
      items: [...page.items],
      nextCursor: page.hasMore && last !== undefined ? encodeCursor(last) : null,
    };
  }
}
