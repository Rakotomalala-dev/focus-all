import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type Task as TaskRow } from "@prisma/client";
import type { Task, TaskDraft } from "@focus/contracts";
import { PrismaService } from "../../database/prisma.service";
import { uuidV7 } from "../../common/uuid-v7";
import { toTask, toTaskPayload } from "./task.mapper";
import type {
  MutationOptions,
  MutationResult,
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

// Chaque écriture et son `SyncChange` vivent dans la même transaction (N-4).
// Le journal est donc soit complet, soit absent : un client ne peut pas voir
// une tâche modifiée sans son changement.
@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  // Jeton explicite : le projet n'active pas `emitDecoratorMetadata`, donc un
  // paramètre de constructeur non décoré arrive `undefined` à l'exécution.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Neon (et toute base distante) peut mettre plus de 2 s à ouvrir une
  // transaction après une mise en veille : les valeurs par défaut de Prisma
  // (maxWait 2 s) feraient échouer une inscription légitime.
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
          ...(draft.description === undefined ? {} : { description: draft.description }),
          ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
          ...(draft.dueDate === undefined ? {} : { dueDate: toDateOnly(draft.dueDate) }),
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

      // La version attendue est reprise dans le `WHERE` : deux écritures
      // concurrentes ne peuvent pas gagner toutes les deux.
      const updated = await tx.task.updateMany({
        where: { id, workspaceId, deletedAt: null, version: expectedVersion },
        data: {
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
          // `null` est explicite : la tâche revient dans l'Inbox.
          ...(patch.projectId === undefined ? {} : { projectId: patch.projectId }),
          ...(patch.dueDate === undefined ? {} : { dueDate: toDateOnly(patch.dueDate) }),
          ...(patch.priority === undefined ? {} : { priority: patch.priority }),
          ...(patch.tagIds === undefined ? {} : { tagIds: [...patch.tagIds] }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.status === undefined ? {} : { completedAt }),
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

      // Suppression logique (doc 01 §9.3) : la ligne reste pour les tombstones
      // et la purge différée.
      const updated = await tx.task.updateMany({
        where: { id, workspaceId, deletedAt: null, version: expectedVersion },
        data: {
          deletedAt: new Date(),
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
        operation: "DELETE",
        version: row.version,
        payload: { id },
        options,
      });
      return { status: "ok", task };
    });
  }

  async list(filters: TaskFilters, workspaceId: string, page: TaskPage): Promise<TaskPageResult> {
    const where: Prisma.TaskWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.projectId === undefined ? {} : { projectId: filters.projectId }),
    };

    if (page.after !== undefined) {
      // Comparaison de tuple (sortOrder, id) : l'égalité de `sortOrder` doit
      // être départagée par `id`, sinon une page peut boucler.
      where.OR = [
        { sortOrder: { gt: page.after.sortOrder } },
        { sortOrder: page.after.sortOrder, id: { gt: page.after.id } },
      ];
    }

    const rows = await this.prisma.task.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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
