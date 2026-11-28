import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  MAX_SUBTASKS,
  inboxEmptySchema,
  taskDraftSchema,
  taskListQuerySchema,
  taskOrderSchema,
  taskUpdateSchema,
  uuidSchema,
  versionQuerySchema,
  type RecurrenceMode,
  type Task,
  type TaskDraft,
  type TaskListResponse,
  type TrashResponse,
} from "@focus/contracts";
import { DomainError } from "../../common/domain-error";
import { describeIssues } from "../../common/zod-issues";
import type { AuthContext } from "../auth/auth-context";
import { PROJECT_REPOSITORY, type ProjectRepository } from "../projects/project.repository";
import { RemindersService } from "../reminders/reminders.service";
import { TAG_REPOSITORY, type TagRepository } from "../tags/tag.repository";
import { assertRecurrenceRule, nextOccurrence } from "./recurrence";
import { cursorOf, type MutationResult, type TaskCursor, type TaskFilters, type TaskPatch, type TaskRepository } from "./task.repository";
import { TASK_REPOSITORY } from "./task.repository";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

type VersionSource = "payload" | "if-match";

type ExpectedVersion = {
  readonly version: number;
  readonly source: VersionSource;
};

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

function decodeCursor(cursor: string, sort: string): TaskCursor {
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

  const parsedId = uuidSchema.safeParse(decoded.id);
  if (
    decoded.sort !== sort ||
    (decoded.value !== null && typeof decoded.value !== "string") ||
    !parsedId.success
  ) {
    throw invalid;
  }

  return { sort: sort as TaskCursor["sort"], value: decoded.value, id: parsedId.data };
}

function encodeCursor(task: Task, sort: TaskCursor["sort"]): string {
  return Buffer.from(JSON.stringify(cursorOf(task, sort)), "utf8").toString("base64url");
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(RemindersService) private readonly reminders: RemindersService,
  ) {}

  async create(auth: AuthContext, rawBody: unknown): Promise<Task> {
    const parsed = taskDraftSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const draft = await this.validateDraft(auth, parsed.data);
    const task = await this.tasks.create(draft, auth.workspaceId, { actorId: auth.userId });
    // RF-50 : les rappels de la nouvelle tâche sont planifiés immédiatement.
    await this.reminders.scheduleTask(task, {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
    });
    return task;
  }

  private async validateDraft(auth: AuthContext, draft: TaskDraft): Promise<TaskDraft> {
    await this.validateTags(auth, draft.tagIds);
    if (draft.recurrenceRule !== undefined) {
      assertRecurrenceRule(draft.recurrenceRule);
    }

    let projectId = draft.projectId;
    let dueDate = draft.dueDate;
    let dueTime = draft.dueTime;

    if (draft.parentId !== undefined) {
      const parent = await this.tasks.findById(draft.parentId, auth.workspaceId);
      if (parent === undefined || parent.parentId !== undefined) {
        throw new DomainError("task.parent_invalid");
      }
      if (draft.dueDate !== undefined) {
        throw new DomainError("task.subtask_due_date");
      }
      const children = await this.tasks.list(
        { parentId: parent.id, includeCompleted: true },
        auth.workspaceId,
        { limit: MAX_SUBTASKS + 1 },
        "MANUAL",
      );
      if (children.items.length >= MAX_SUBTASKS) {
        throw new DomainError("task.subtask_limit");
      }
      // Une sous-tâche hérite du projet du parent (RF-22).
      projectId = parent.projectId;
      dueDate = undefined;
      dueTime = undefined;
    }

    if (projectId !== undefined) {
      const project = await this.projects.findById(projectId, auth.workspaceId);
      if (project === undefined) {
        throw new DomainError("project.not_found");
      }
      if (project.archivedAt !== null) {
        throw new DomainError("task.project_archived");
      }
    }

    // RF-50 : cinq rappels au total, et un rappel relatif exige une échéance.
    RemindersService.assertReminderBudget(
      draft.reminders,
      draft.reminderOffsets,
      dueDate,
    );

    return {
      ...draft,
      ...(projectId === undefined ? {} : { projectId }),
      ...(dueDate === undefined ? {} : { dueDate }),
      ...(dueTime === undefined ? {} : { dueTime }),
    };
  }

  private async validateTags(auth: AuthContext, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const unique = [...new Set(ids)];
    const found = await this.tags.findByIds(unique, auth.workspaceId);
    if (found.length !== unique.length) {
      throw new DomainError("task.tag_not_found");
    }
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
    const existing = await this.findById(auth, id);
    const { version, ...fields } = parsed.data;
    const expected = resolveExpectedVersion(version, ifMatch);
    const patch = await this.validateUpdate(auth, existing, fields);

    if (Object.keys(patch).length === 0) {
      throw new DomainError("request.empty_patch");
    }

    RemindersService.assertReminderBudget(
      patch.reminders ?? existing.reminders,
      patch.reminderOffsets ?? existing.reminderOffsets,
      patch.dueDate === undefined ? existing.dueDate : (patch.dueDate ?? undefined),
    );

    const updated = this.applyMutation(
      await this.tasks.update(id, auth.workspaceId, patch, expected.version, {
        actorId: auth.userId,
      }),
      expected.source,
    );

    // RF-28 : une occurrence terminée crée la suivante, sans rattrapage.
    if (
      existing.status !== "DONE" &&
      updated.status === "DONE" &&
      updated.recurrenceRule !== undefined &&
      updated.dueDate !== undefined &&
      updated.parentId === undefined
    ) {
      const mode: RecurrenceMode = updated.recurrenceMode;
      const completedOn = (updated.completedAt ?? new Date().toISOString()).slice(0, 10);
      const nextDate = nextOccurrence(updated.recurrenceRule, updated.dueDate, mode, completedOn);
      const next = await this.tasks.create(
        {
          title: updated.title,
          priority: updated.priority,
          tagIds: updated.tagIds,
          reminders: updated.reminders,
          reminderOffsets: updated.reminderOffsets,
          recurrenceMode: updated.recurrenceMode,
          recurrenceRule: updated.recurrenceRule,
          dueDate: nextDate,
          ...(updated.description === undefined ? {} : { description: updated.description }),
          ...(updated.projectId === undefined ? {} : { projectId: updated.projectId }),
          ...(updated.dueTime === undefined ? {} : { dueTime: updated.dueTime }),
          ...(updated.startDate === undefined ? {} : { startDate: updated.startDate }),
          ...(updated.estimateMinutes === undefined
            ? {}
            : { estimateMinutes: updated.estimateMinutes }),
        },
        auth.workspaceId,
        { actorId: auth.userId },
      );
      await this.reminders.scheduleTask(next, {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
      });
    }

    // RF-50 : une tâche terminée ou annulée ne doit plus rappeler son échéance.
    if (updated.status === "DONE" || updated.status === "CANCELLED") {
      await this.reminders.cancelTask(updated.id);
    } else {
      // Toute modification d'échéance ou de rappel replanifie (idempotent).
      await this.reminders.scheduleTask(updated, {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
      });
    }

    return updated;
  }

  private async validateUpdate(
    auth: AuthContext,
    existing: Task,
    fields: Omit<typeof taskUpdateSchema._output, "version">,
  ): Promise<TaskPatch> {
    await this.validateTags(auth, fields.tagIds ?? []);
    if (fields.recurrenceRule !== undefined && fields.recurrenceRule !== null) {
      assertRecurrenceRule(fields.recurrenceRule);
    }

    const patch: { -readonly [K in keyof TaskPatch]: TaskPatch[K] } = {
      ...(fields.title === undefined ? {} : { title: fields.title }),
      ...(fields.description === undefined ? {} : { description: fields.description }),
      ...(fields.projectId === undefined ? {} : { projectId: fields.projectId }),
      ...(fields.dueDate === undefined ? {} : { dueDate: fields.dueDate }),
      ...(fields.dueTime === undefined ? {} : { dueTime: fields.dueTime }),
      ...(fields.startDate === undefined ? {} : { startDate: fields.startDate }),
      ...(fields.priority === undefined ? {} : { priority: fields.priority }),
      ...(fields.tagIds === undefined ? {} : { tagIds: fields.tagIds }),
      ...(fields.reminders === undefined ? {} : { reminders: fields.reminders }),
      ...(fields.reminderOffsets === undefined
        ? {}
        : { reminderOffsets: fields.reminderOffsets }),
      ...(fields.recurrenceRule === undefined ? {} : { recurrenceRule: fields.recurrenceRule }),
      ...(fields.recurrenceMode === undefined ? {} : { recurrenceMode: fields.recurrenceMode }),
      ...(fields.estimateMinutes === undefined
        ? {}
        : { estimateMinutes: fields.estimateMinutes }),
      ...(fields.status === undefined ? {} : { status: fields.status }),
      ...(fields.pinned === undefined ? {} : { pinned: fields.pinned }),
    };

    if (fields.parentId !== undefined) {
      if (fields.parentId === null) {
        const children = await this.tasks.list(
          { parentId: existing.id, includeCompleted: true },
          auth.workspaceId,
          { limit: 1 },
          "MANUAL",
        );
        if (children.items.length > 0) {
          throw new DomainError("task.parent_invalid");
        }
        patch.parentId = null;
      } else {
        if (fields.parentId === existing.id) {
          throw new DomainError("task.parent_invalid");
        }
        const parent = await this.tasks.findById(fields.parentId, auth.workspaceId);
        if (parent === undefined || parent.parentId !== undefined) {
          throw new DomainError("task.parent_invalid");
        }
        const children = await this.tasks.list(
          { parentId: parent.id, includeCompleted: true },
          auth.workspaceId,
          { limit: MAX_SUBTASKS + 1 },
          "MANUAL",
        );
        if (children.items.length >= MAX_SUBTASKS) {
          throw new DomainError("task.subtask_limit");
        }
        if (fields.dueDate !== undefined && fields.dueDate !== null) {
          throw new DomainError("task.subtask_due_date");
        }
        patch.parentId = parent.id;
        patch.projectId = parent.projectId ?? null;
        patch.dueDate = null;
        patch.dueTime = null;
      }
    }

    if (existing.parentId !== undefined) {
      if (fields.dueDate !== undefined && fields.dueDate !== null) {
        throw new DomainError("task.subtask_due_date");
      }
      if (fields.projectId !== undefined) {
        throw new DomainError("task.parent_invalid");
      }
    }

    const projectId = patch.projectId === undefined ? existing.projectId : patch.projectId;
    if (projectId !== null && projectId !== undefined) {
      const project = await this.projects.findById(projectId, auth.workspaceId);
      if (project === undefined) {
        throw new DomainError("project.not_found");
      }
      if (project.archivedAt !== null) {
        throw new DomainError("task.project_archived");
      }
    }

    return patch;
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
      await this.tasks.remove(id, auth.workspaceId, expected.version, { actorId: auth.userId }),
      expected.source,
    );
    await this.reminders.cancelTask(id);
  }

  async restore(auth: AuthContext, rawId: string): Promise<Task> {
    const result = await this.tasks.restore(this.parseId(rawId), auth.workspaceId, {
      actorId: auth.userId,
    });
    if (result.status !== "ok") {
      throw new DomainError("task.not_found");
    }
    await this.reminders.scheduleTask(result.task, {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
    });
    return result.task;
  }

  async list(auth: AuthContext, rawQuery: unknown): Promise<TaskListResponse> {
    const parsed = taskListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const { cursor, limit, status, priority, projectId, inbox, parentId, tagIds, due, q, includeCompleted, sort } =
      parsed.data;
    const filters: TaskFilters = {
      ...(status === undefined ? {} : { status }),
      ...(priority === undefined ? {} : { priority }),
      ...(projectId === undefined ? {} : { projectId }),
      ...(inbox === undefined ? {} : { inbox }),
      ...(parentId === undefined ? {} : { parentId }),
      ...(tagIds === undefined ? {} : { tagIds }),
      ...(due === undefined ? {} : { due }),
      ...(q === undefined ? {} : { q }),
      ...(includeCompleted === undefined ? {} : { includeCompleted }),
    };
    const after = cursor === undefined ? undefined : decodeCursor(cursor, sort);

    const page = await this.tasks.list(
      filters,
      auth.workspaceId,
      after === undefined ? { limit } : { limit, after },
      sort,
    );
    const last = page.items.at(-1);

    return {
      items: [...page.items],
      nextCursor: page.hasMore && last !== undefined ? encodeCursor(last, sort) : null,
    };
  }

  async reorder(auth: AuthContext, rawBody: unknown): Promise<readonly Task[]> {
    const parsed = taskOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    return this.tasks.reorder(parsed.data.ids, auth.workspaceId, { actorId: auth.userId });
  }

  async emptyInbox(auth: AuthContext, rawBody: unknown): Promise<{ moved: number }> {
    const parsed = inboxEmptySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const project = await this.projects.findById(parsed.data.projectId, auth.workspaceId);
    if (project === undefined) {
      throw new DomainError("project.not_found");
    }
    if (project.archivedAt !== null) {
      throw new DomainError("task.project_archived");
    }
    const moved = await this.tasks.emptyInbox(parsed.data.projectId, auth.workspaceId, {
      actorId: auth.userId,
    });
    return { moved };
  }

  async trash(auth: AuthContext): Promise<TrashResponse> {
    const [tasks, projects] = await Promise.all([
      this.tasks.listDeleted(auth.workspaceId),
      this.projects.listDeleted(auth.workspaceId),
    ]);
    return { tasks: [...tasks], projects: [...projects] };
  }
}
