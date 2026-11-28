import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type Task as TaskRow } from "@prisma/client";
import type { Task, TaskDraft, TaskSort, TaskStatus } from "@focus/contracts";
import { PrismaService } from "../../database/prisma.service";
import { uuidV7 } from "../../common/uuid-v7";
import { toTask, toTaskPayload } from "./task.mapper";
import { priorityRank } from "./task.repository";
import type {
  BoardPosition,
  MutationOptions,
  MutationResult,
  TaskCursor,
  TaskFilters,
  TaskPage,
  TaskPageResult,
  TaskPatch,
  TaskRepository,
} from "./task.repository";

// Date civile (`YYYY-MM-DD`) → minuit UTC : la valeur stockée ne dépend jamais
// du fuseau du serveur (doc 01 §9.3).
function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function todayUtc(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function orderByFor(sort: TaskSort): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case "DUE_DATE":
      return [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "PRIORITY":
      return [{ priority: "desc" }, { id: "asc" }];
    case "CREATED_AT":
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "TITLE":
      return [{ title: "asc" }, { id: "asc" }];
    case "MANUAL":
      return [{ sortOrder: "asc" }, { id: "asc" }];
  }
}

function cursorWhere(sort: TaskSort, after: TaskCursor): Prisma.TaskWhereInput {
  const id = after.id;
  switch (sort) {
    case "MANUAL":
      return {
        OR: [
          { sortOrder: { gt: after.value ?? "" } },
          { sortOrder: after.value ?? "", id: { gt: id } },
        ],
      };
    case "DUE_DATE":
      if (after.value === null) {
        return { dueDate: null, id: { gt: id } };
      }
      return {
        OR: [
          { dueDate: { gt: toDateOnly(after.value) } },
          { dueDate: toDateOnly(after.value), id: { gt: id } },
          { dueDate: null },
        ],
      };
    case "PRIORITY": {
      const current = after.value as keyof typeof priorityRank | null;
      const lower = current === null
        ? []
        : (["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const).filter(
            (priority) => priorityRank(priority) < priorityRank(current),
          );
      return {
        OR: [
          ...(lower.length === 0 ? [] : [{ priority: { in: [...lower] } }]),
          { priority: current ?? "URGENT", id: { gt: id } },
        ],
      };
    }
    case "CREATED_AT":
      return {
        OR: [
          { createdAt: { lt: new Date(after.value ?? 0) } },
          { createdAt: new Date(after.value ?? 0), id: { gt: id } },
        ],
      };
    case "TITLE":
      return {
        OR: [
          { title: { gt: after.value ?? "" } },
          { title: after.value ?? "", id: { gt: id } },
        ],
      };
  }
}

// Chaque écriture et son `SyncChange` vivent dans la même transaction (N-4).
// Le journal est donc soit complet, soit absent : un client ne peut pas voir
// une tâche modifiée sans son changement.
@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
  }

  private recordChange(
    tx: Prisma.TransactionClient,
    change: {
      readonly workspaceId: string;
      readonly entityId: string;
      readonly operation: "UPSERT" | "DELETE";
      readonly version: number;
      readonly payload: Prisma.InputJsonObject;
      readonly options: MutationOptions | undefined;
    },
  ): Promise<unknown> {
    return tx.syncChange.create({
      data: {
        workspaceId: change.workspaceId,
        entityType: "task",
        entityId: change.entityId,
        operation: change.operation,
        version: change.version,
        payload: change.payload,
        ...(change.options?.actorId === undefined ? {} : { actorId: change.options.actorId }),
        ...(change.options?.clientMutationId === undefined
          ? {}
          : { clientMutationId: change.options.clientMutationId }),
      },
    });
  }

  async create(
    draft: TaskDraft,
    workspaceId: string,
    options?: MutationOptions,
  ): Promise<Task> {
    return this.transaction(async (tx) => {
      const max = await tx.task.aggregate({
        where: { workspaceId },
        _max: { sortOrder: true },
      });
      const sortOrder = max._max.sortOrder?.plus(1) ?? new Prisma.Decimal(1);

      const row = await tx.task.create({
        data: {
          id: options?.id ?? uuidV7(),
          workspaceId,
          title: draft.title,
          priority: draft.priority,
          status: "TODO",
          sortOrder,
          version: 0,
          tagIds: [...draft.tagIds],
          reminders: [...draft.reminders],
          reminderOffsets: [...draft.reminderOffsets],
          recurrenceMode: draft.recurrenceMode,
          ...(draft.description === undefined ? {} : { description: draft.description }),
          ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
          ...(draft.parentId === undefined ? {} : { parentId: draft.parentId }),
          ...(draft.dueDate === undefined ? {} : { dueDate: toDateOnly(draft.dueDate) }),
          ...(draft.dueTime === undefined ? {} : { dueTime: draft.dueTime }),
          ...(draft.startDate === undefined ? {} : { startDate: toDateOnly(draft.startDate) }),
          ...(draft.recurrenceRule === undefined ? {} : { recurrenceRule: draft.recurrenceRule }),
          ...(draft.estimateMinutes === undefined
            ? {}
            : { estimateMinutes: draft.estimateMinutes }),
          ...(options?.actorId === undefined ? {} : { createdBy: options.actorId }),
        },
      });

      const task = toTask(row);
      await this.recordChange(tx, {
        workspaceId,
        entityId: row.id,
        operation: "UPSERT",
        version: row.version,
        payload: toTaskPayload(task),
        options,
      });
      return task;
    });
  }

  async findById(id: string, workspaceId: string): Promise<Task | undefined> {
    const row = await this.prisma.task.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row === null ? undefined : toTask(row);
  }

  async update(
    id: string,
    workspaceId: string,
    patch: TaskPatch,
    expectedVersion: number,
    options?: MutationOptions,
  ): Promise<MutationResult> {
    return this.transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (existing === null) {
        return { status: "not_found" };
      }
      if (existing.version !== expectedVersion) {
        return { status: "conflict", currentVersion: existing.version };
      }

      const now = new Date();
      const completedAt =
        patch.status === undefined
          ? existing.completedAt
          : patch.status === "DONE"
            ? (existing.completedAt ?? now)
            : null;

      const updated = await tx.task.updateMany({
        where: { id, workspaceId, deletedAt: null, version: expectedVersion },
        data: {
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
          ...(patch.projectId === undefined ? {} : { projectId: patch.projectId }),
          ...(patch.parentId === undefined ? {} : { parentId: patch.parentId }),
          ...(patch.dueDate === undefined
            ? {}
            : { dueDate: patch.dueDate === null ? null : toDateOnly(patch.dueDate) }),
          ...(patch.dueTime === undefined ? {} : { dueTime: patch.dueTime }),
          ...(patch.startDate === undefined
            ? {}
            : { startDate: patch.startDate === null ? null : toDateOnly(patch.startDate) }),
          ...(patch.priority === undefined ? {} : { priority: patch.priority }),
          ...(patch.tagIds === undefined ? {} : { tagIds: [...patch.tagIds] }),
          ...(patch.reminders === undefined ? {} : { reminders: [...patch.reminders] }),
          ...(patch.reminderOffsets === undefined
            ? {}
            : { reminderOffsets: [...patch.reminderOffsets] }),
          ...(patch.recurrenceRule === undefined
            ? {}
            : { recurrenceRule: patch.recurrenceRule }),
          ...(patch.recurrenceMode === undefined
            ? {}
            : { recurrenceMode: patch.recurrenceMode }),
          ...(patch.estimateMinutes === undefined
            ? {}
            : { estimateMinutes: patch.estimateMinutes }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.status === undefined ? {} : { completedAt }),
          ...(patch.pinned === undefined ? {} : { pinnedAt: patch.pinned ? now : null }),
          version: { increment: 1 },
          ...(options?.actorId === undefined ? {} : { updatedBy: options.actorId }),
        },
      });
      if (updated.count === 0) {
        const current = await tx.task.findFirst({ where: { id, workspaceId, deletedAt: null } });
        return current === null
          ? { status: "not_found" }
          : { status: "conflict", currentVersion: current.version };
      }

      const row = await tx.task.findUniqueOrThrow({ where: { id } });
      const task = toTask(row);
      await this.recordChange(tx, {
        workspaceId,
        entityId: id,
        operation: "UPSERT",
        version: row.version,
        payload: toTaskPayload(task),
        options,
      });
      return { status: "ok", task };
    });
  }

  async remove(
    id: string,
    workspaceId: string,
    expectedVersion: number,
    options?: MutationOptions,
  ): Promise<MutationResult> {
    return this.transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (existing === null) {
        return { status: "not_found" };
      }
      if (existing.version !== expectedVersion) {
        return { status: "conflict", currentVersion: existing.version };
      }

      const now = new Date();
      const updated = await tx.task.updateMany({
        where: { id, workspaceId, deletedAt: null, version: expectedVersion },
        data: {
          deletedAt: now,
          version: { increment: 1 },
          ...(options?.actorId === undefined ? {} : { updatedBy: options.actorId }),
        },
      });
      if (updated.count === 0) {
        const current = await tx.task.findFirst({ where: { id, workspaceId, deletedAt: null } });
        return current === null
          ? { status: "not_found" }
          : { status: "conflict", currentVersion: current.version };
      }

      // Supprimer un parent supprime ses enfants (RF-22).
      const children = await tx.task.findMany({
        where: { workspaceId, parentId: id, deletedAt: null },
      });
      for (const child of children) {
        const childRow = await tx.task.update({
          where: { id: child.id },
          data: {
            deletedAt: now,
            version: { increment: 1 },
            ...(options?.actorId === undefined ? {} : { updatedBy: options.actorId }),
          },
        });
        await this.recordChange(tx, {
          workspaceId,
          entityId: childRow.id,
          operation: "DELETE",
          version: childRow.version,
          payload: { id: childRow.id },
          options,
        });
      }

      const row = await tx.task.findUniqueOrThrow({ where: { id } });
      const task = toTask(row);
      await this.recordChange(tx, {
        workspaceId,
        entityId: id,
        operation: "DELETE",
        version: row.version,
        payload: { id },
        options,
      });
      return { status: "ok", task };
    });
  }

  // RF-34 : statut + position dans la colonne Kanban du projet, dans la même
  // transaction que le journal de synchronisation (N-4), donc visible sur un
  // autre appareil après `sync/pull`.
  async moveOnBoard(
    id: string,
    workspaceId: string,
    expectedVersion: number,
    status: TaskStatus,
    position: BoardPosition,
    options?: MutationOptions,
  ): Promise<MutationResult> {
    return this.transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (existing === null || existing.projectId === null) {
        return { status: "not_found" };
      }
      if (existing.version !== expectedVersion) {
        return { status: "conflict", currentVersion: existing.version };
      }
      const projectId = existing.projectId;

      const anchor = async (
        neighborId: string | null | undefined,
      ): Promise<Prisma.Decimal | null> => {
        if (neighborId === null || neighborId === undefined) {
          return null;
        }
        const row = await tx.task.findFirst({
          where: {
            id: neighborId,
            workspaceId,
            projectId,
            status,
            deletedAt: null,
          },
          select: { boardOrder: true, sortOrder: true },
        });
        return row === null ? null : (row.boardOrder ?? row.sortOrder);
      };

      const after = await anchor(position.afterId);
      const before = await anchor(position.beforeId);

      let boardOrder: Prisma.Decimal;
      if (after !== null && before !== null) {
        boardOrder = after.plus(before).dividedBy(2);
      } else if (after !== null) {
        boardOrder = after.plus(1);
      } else if (before !== null) {
        boardOrder = before.minus(1);
      } else {
        const max = await tx.task.aggregate({
          where: {
            workspaceId,
            projectId,
            status,
            deletedAt: null,
          },
          _max: { boardOrder: true },
        });
        boardOrder = (max._max.boardOrder ?? new Prisma.Decimal(0)).plus(1);
      }

      const now = new Date();
      const completedAt = status === "DONE" ? (existing.completedAt ?? now) : null;
      const updated = await tx.task.updateMany({
        where: { id, workspaceId, deletedAt: null, version: expectedVersion },
        data: {
          status,
          completedAt,
          boardOrder,
          version: { increment: 1 },
          ...(options?.actorId === undefined ? {} : { updatedBy: options.actorId }),
        },
      });
      if (updated.count === 0) {
        const current = await tx.task.findFirst({ where: { id, workspaceId, deletedAt: null } });
        return current === null
          ? { status: "not_found" }
          : { status: "conflict", currentVersion: current.version };
      }

      const row = await tx.task.findUniqueOrThrow({ where: { id } });
      const task = toTask(row);
      await this.recordChange(tx, {
        workspaceId,
        entityId: id,
        operation: "UPSERT",
        version: row.version,
        payload: toTaskPayload(task),
        options,
      });
      return { status: "ok", task };
    });
  }

  async restore(
    id: string,
    workspaceId: string,
    options?: MutationOptions,
  ): Promise<MutationResult> {
    return this.transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, workspaceId, deletedAt: { not: null } },
      });
      if (existing === null) {
        return { status: "not_found" };
      }

      const row = await tx.task.update({
        where: { id },
        data: {
          deletedAt: null,
          version: { increment: 1 },
          ...(options?.actorId === undefined ? {} : { updatedBy: options.actorId }),
        },
      });
      await this.recordChange(tx, {
        workspaceId,
        entityId: id,
        operation: "UPSERT",
        version: row.version,
        payload: toTaskPayload(toTask(row)),
        options,
      });

      const children = await tx.task.findMany({
        where: { workspaceId, parentId: id, deletedAt: { not: null } },
      });
      for (const child of children) {
        const childRow = await tx.task.update({
          where: { id: child.id },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        await this.recordChange(tx, {
          workspaceId,
          entityId: childRow.id,
          operation: "UPSERT",
          version: childRow.version,
          payload: toTaskPayload(toTask(childRow)),
          options,
        });
      }
      return { status: "ok", task: toTask(row) };
    });
  }

  async listDeleted(workspaceId: string): Promise<readonly Task[]> {
    const rows = await this.prisma.task.findMany({
      where: { workspaceId, deletedAt: { not: null } },
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toTask);
  }

  async reorder(
    ids: readonly string[],
    workspaceId: string,
    options?: MutationOptions,
  ): Promise<readonly Task[]> {
    return this.transaction(async (tx) => {
      const tasks: Task[] = [];
      for (const [index, id] of ids.entries()) {
        const updated = await tx.task.updateMany({
          where: { id, workspaceId, deletedAt: null },
          data: {
            sortOrder: new Prisma.Decimal(index + 1),
            version: { increment: 1 },
            ...(options?.actorId === undefined ? {} : { updatedBy: options.actorId }),
          },
        });
        if (updated.count === 0) {
          continue;
        }
        const row = await tx.task.findUniqueOrThrow({ where: { id } });
        const task = toTask(row);
        tasks.push(task);
        await this.recordChange(tx, {
          workspaceId,
          entityId: id,
          operation: "UPSERT",
          version: row.version,
          payload: toTaskPayload(task),
          options,
        });
      }
      return tasks;
    });
  }

  async emptyInbox(
    projectId: string,
    workspaceId: string,
    options?: MutationOptions,
  ): Promise<number> {
    return this.transaction(async (tx) => {
      const tasks = await tx.task.findMany({
        where: { workspaceId, deletedAt: null, projectId: null, parentId: null },
        select: { id: true },
      });
      let count = 0;
      for (const task of tasks) {
        const row = await tx.task.update({
          where: { id: task.id },
          data: {
            projectId,
            version: { increment: 1 },
            ...(options?.actorId === undefined ? {} : { updatedBy: options.actorId }),
          },
        });
        await this.recordChange(tx, {
          workspaceId,
          entityId: row.id,
          operation: "UPSERT",
          version: row.version,
          payload: toTaskPayload(toTask(row)),
          options,
        });
        count += 1;
      }
      return count;
    });
  }

  async list(
    filters: TaskFilters,
    workspaceId: string,
    page: TaskPage,
    sort: TaskSort,
  ): Promise<TaskPageResult> {
    const where: Prisma.TaskWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.priority === undefined ? {} : { priority: filters.priority }),
      ...(filters.projectId === undefined ? {} : { projectId: filters.projectId }),
      ...(filters.inbox === true ? { projectId: null } : {}),
      ...(filters.parentId === undefined ? {} : { parentId: filters.parentId }),
      ...(filters.tagIds === undefined || filters.tagIds.length === 0
        ? {}
        : { tagIds: { hasEvery: [...filters.tagIds] } }),
    };

    if (
      filters.includeCompleted !== true &&
      filters.status === undefined
    ) {
      where.status = { notIn: ["DONE", "CANCELLED"] };
    }

    if (filters.due !== undefined) {
      const today = todayUtc();
      if (filters.due === "NONE") {
        where.dueDate = null;
      } else if (filters.due === "OVERDUE") {
        where.dueDate = { lt: today };
      } else if (filters.due === "TODAY") {
        where.dueDate = today;
      } else {
        where.dueDate = { gte: today, lte: addDays(today, 7) };
      }
    }

    if (filters.q !== undefined) {
      // PostgreSQL FTS : `plainto_tsquery` + colonne générée non accentuée,
      // indexée GIN. Les ids filtrés restent soumis au scope workspace.
      const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Task"
        WHERE "workspaceId" = ${workspaceId}::uuid
          AND "deletedAt" IS NULL
          AND "searchVector" @@ plainto_tsquery('simple', focus_unaccent(${filters.q}))
      `;
      where.id = { in: ids.map((row) => row.id) };
      if (ids.length === 0) {
        return { items: [], hasMore: false };
      }
    }

    if (page.after !== undefined) {
      where.AND = [cursorWhere(sort, page.after)];
    }

    const rows = await this.prisma.task.findMany({
      where,
      orderBy: orderByFor(sort),
      take: page.limit + 1,
    });

    return {
      items: rows.slice(0, page.limit).map(toTask),
      hasMore: rows.length > page.limit,
    };
  }

  async snapshot(workspaceId: string): Promise<readonly Task[]> {
    const rows: TaskRow[] = await this.prisma.task.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(toTask);
  }
}
