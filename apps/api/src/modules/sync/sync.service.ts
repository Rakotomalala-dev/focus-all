import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  syncPullQuerySchema,
  syncPushRequestSchema,
  taskDraftSchema,
  taskUpdateSchema,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncPushResult,
  type SyncSnapshotResponse,
  type SyncMutation,
} from "@focus/contracts";
import { describeIssues } from "../../common/zod-issues";
import { PrismaService } from "../../database/prisma.service";
import type { AuthContext } from "../auth/auth-context";
import { toTaskPatch } from "../tasks/task-patch";
import { RemindersService } from "../reminders/reminders.service";
import { TASK_REPOSITORY, type MutationResult, type TaskRepository } from "../tasks/task.repository";

// Le push est volontairement « un item = une transaction » (doc 01 §11.2) :
// une mutation invalide ne doit pas annuler les autres du lot. Chaque appel au
// repository ouvre sa transaction et y écrit le `SyncChange` (N-4).
@Injectable()
export class SyncService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(RemindersService) private readonly reminders: RemindersService,
  ) {}

  private async currentCursor(workspaceId: string): Promise<number> {
    const max = await this.prisma.syncChange.aggregate({
      where: { workspaceId },
      _max: { id: true },
    });
    return max._max.id === null ? 0 : Number(max._max.id);
  }

  private rejection(
    mutation: SyncMutation,
    reason: string,
    code: string,
    version?: number,
  ): SyncPushResult {
    return {
      clientMutationId: mutation.clientMutationId,
      status: "rejected",
      entityId: mutation.entityId,
      code,
      reason,
      ...(version === undefined ? {} : { version }),
    };
  }

  // Un conflit renvoie l'état serveur : le client remplace sa ligne locale sans
  // requête supplémentaire (doc 03 §6.3).
  private async toResult(
    mutation: SyncMutation,
    workspaceId: string,
    result: MutationResult,
    deleted: boolean,
  ): Promise<SyncPushResult> {
    if (result.status === "not_found") {
      return this.rejection(mutation, "task.not_found", "NOT_FOUND");
    }
    if (result.status === "conflict") {
      const server = await this.tasks.findById(mutation.entityId, workspaceId);
      return {
        clientMutationId: mutation.clientMutationId,
        status: "conflict",
        entityId: mutation.entityId,
        version: result.currentVersion,
        server: server ?? null,
      };
    }
    return {
      clientMutationId: mutation.clientMutationId,
      status: "applied",
      entityId: mutation.entityId,
      version: result.task.version,
      server: deleted ? null : result.task,
    };
  }

  private async applyMutation(
    auth: AuthContext,
    mutation: SyncMutation,
  ): Promise<SyncPushResult> {
    // Idempotence : un `clientMutationId` déjà journalisé renvoie l'état
    // courant sans réécrire quoi que ce soit (retry réseau).
    const previous = await this.prisma.syncChange.findFirst({
      where: {
        workspaceId: auth.workspaceId,
        clientMutationId: mutation.clientMutationId,
      },
      select: { version: true },
    });
    if (previous !== null) {
      const task = await this.tasks.findById(mutation.entityId, auth.workspaceId);
      return {
        clientMutationId: mutation.clientMutationId,
        status: "applied",
        entityId: mutation.entityId,
        version: task?.version ?? previous.version,
        server: task ?? null,
      };
    }

    const options = {
      actorId: auth.userId,
      clientMutationId: mutation.clientMutationId,
    };

    if (mutation.operation === "CREATE") {
      const parsed = taskDraftSchema.safeParse(mutation.payload);
      if (!parsed.success) {
        return this.rejection(mutation, "sync.invalid_payload", "VALIDATION_FAILED");
      }
      // Une création rejouée avec le même identifiant UUID v7 (déjà présente)
      // est un succès idempotent, pas un conflit.
      const existing = await this.tasks.findById(mutation.entityId, auth.workspaceId);
      if (existing !== undefined) {
        return {
          clientMutationId: mutation.clientMutationId,
          status: "applied",
          entityId: mutation.entityId,
          version: existing.version,
          server: existing,
        };
      }
      const created = await this.tasks.create(parsed.data, auth.workspaceId, {
        ...options,
        id: mutation.entityId,
      });
      await this.reminders.scheduleTask(created, {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
      });
      return {
        clientMutationId: mutation.clientMutationId,
        status: "applied",
        entityId: mutation.entityId,
        version: created.version,
        server: created,
      };
    }

    if (mutation.baseVersion === undefined) {
      return this.rejection(mutation, "sync.missing_base_version", "VALIDATION_FAILED");
    }

    if (mutation.operation === "DELETE") {
      const removed = await this.tasks.remove(
        mutation.entityId,
        auth.workspaceId,
        mutation.baseVersion,
        options,
      );
      const deleteResult = await this.toResult(mutation, auth.workspaceId, removed, true);
      if (deleteResult.status === "applied") {
        await this.reminders.cancelTask(mutation.entityId);
      }
      return deleteResult;
    }

    const parsed = taskUpdateSchema.safeParse(mutation.payload);
    if (!parsed.success) {
      return this.rejection(mutation, "sync.invalid_payload", "VALIDATION_FAILED");
    }
    const { version: _version, ...fields } = parsed.data;
    const patch = toTaskPatch(fields);
    if (Object.keys(patch).length === 0) {
      return this.rejection(mutation, "sync.empty_patch", "VALIDATION_FAILED");
    }

    const updated = await this.tasks.update(
      mutation.entityId,
      auth.workspaceId,
      patch,
      mutation.baseVersion,
      options,
    );
    const updateResult = await this.toResult(mutation, auth.workspaceId, updated, false);
    if (
      updateResult.status === "applied" &&
      updateResult.server !== null &&
      updateResult.server !== undefined
    ) {
      const task = updateResult.server;
      if (task.status === "DONE" || task.status === "CANCELLED") {
        await this.reminders.cancelTask(task.id);
      } else {
        await this.reminders.scheduleTask(task, {
          userId: auth.userId,
          workspaceId: auth.workspaceId,
        });
      }
    }
    return updateResult;
  }

  async push(auth: AuthContext, rawBody: unknown): Promise<SyncPushResponse> {
    const parsed = syncPushRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const results: SyncPushResult[] = [];
    for (const mutation of parsed.data.mutations) {
      results.push(await this.applyMutation(auth, mutation));
    }

    return { results, cursor: await this.currentCursor(auth.workspaceId) };
  }

  async pull(auth: AuthContext, rawQuery: unknown): Promise<SyncPullResponse> {
    const parsed = syncPullQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const { since, limit } = parsed.data;
    const rows = await this.prisma.syncChange.findMany({
      where: { workspaceId: auth.workspaceId, id: { gt: BigInt(since) } },
      orderBy: { id: "asc" },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const changes = page.map((row) => ({
      cursor: Number(row.id),
      entityType: "task" as const,
      entityId: row.entityId,
      operation: row.operation,
      version: row.version,
      payload: row.payload,
      actorId: row.actorId,
      changedAt: row.changedAt.toISOString(),
    }));

    return {
      changes,
      nextCursor: changes.at(-1)?.cursor ?? since,
      hasMore,
    };
  }

  async snapshot(auth: AuthContext): Promise<SyncSnapshotResponse> {
    const [tasks, cursor] = await Promise.all([
      this.tasks.snapshot(auth.workspaceId),
      this.currentCursor(auth.workspaceId),
    ]);
    return { tasks: [...tasks], cursor };
  }
}
