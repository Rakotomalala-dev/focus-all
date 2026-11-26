import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Project, ProjectDraft } from "@focus/contracts";
import { uuidV7 } from "../../common/uuid-v7";
import { PrismaService } from "../../database/prisma.service";
import { toTask, toTaskPayload } from "../tasks/task.mapper";
import { toProject, toProjectPayload } from "./project.mapper";
import type {
  ProjectCreateResult,
  ProjectMutationResult,
  ProjectPatch,
  ProjectRepository,
} from "./project.repository";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Toute écriture de projet et son `SyncChange` partagent la transaction (N-4) :
// un client ne peut pas voir un projet modifié sans son changement.
@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
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
      readonly actorId: string | undefined;
    },
  ): Promise<unknown> {
    return tx.syncChange.create({
      data: {
        workspaceId: change.workspaceId,
        entityType: "project",
        entityId: change.entityId,
        operation: change.operation,
        version: change.version,
        payload: change.payload,
        ...(change.actorId === undefined ? {} : { actorId: change.actorId }),
      },
    });
  }

  async create(
    draft: ProjectDraft,
    workspaceId: string,
    actorId: string | undefined,
  ): Promise<ProjectCreateResult> {
    try {
      return await this.transaction(async (tx) => {
        const max = await tx.project.aggregate({
          where: { workspaceId, deletedAt: null },
          _max: { sortOrder: true },
        });
        const sortOrder = max._max.sortOrder?.plus(1) ?? new Prisma.Decimal(1);

        const row = await tx.project.create({
          data: {
            id: uuidV7(),
            workspaceId,
            name: draft.name,
            sortOrder,
            version: 0,
            ...(draft.color === undefined ? {} : { color: draft.color }),
            ...(draft.description === undefined ? {} : { description: draft.description }),
          },
        });

        const project = toProject(row);
        await this.recordChange(tx, {
          workspaceId,
          entityId: row.id,
          operation: "UPSERT",
          version: row.version,
          payload: toProjectPayload(project),
          actorId,
        });
        return { status: "ok", project };
      });
    } catch (error) {
      // L'index partiel `lower(name)` est la seule autorité : vérifier puis
      // insérer laisserait une course entre deux créations simultanées.
      if (isUniqueViolation(error)) {
        return { status: "name_taken" };
      }
      throw error;
    }
  }

  async list(workspaceId: string): Promise<readonly Project[]> {
    const rows = await this.prisma.project.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(toProject);
  }

  async findById(id: string, workspaceId: string): Promise<Project | undefined> {
    const row = await this.prisma.project.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row === null ? undefined : toProject(row);
  }

  async update(
    id: string,
    workspaceId: string,
    patch: ProjectPatch,
    expectedVersion: number,
    actorId: string | undefined,
  ): Promise<ProjectMutationResult> {
    try {
      return await this.transaction(async (tx) => {
        const existing = await tx.project.findFirst({
          where: { id, workspaceId, deletedAt: null },
        });
        if (existing === null) {
          return { status: "not_found" };
        }
        if (existing.version !== expectedVersion) {
          return { status: "conflict", currentVersion: existing.version };
        }

        const updated = await tx.project.updateMany({
          where: { id, workspaceId, deletedAt: null, version: expectedVersion },
          data: {
            ...(patch.name === undefined ? {} : { name: patch.name }),
            ...(patch.color === undefined ? {} : { color: patch.color }),
            ...(patch.description === undefined ? {} : { description: patch.description }),
            ...(patch.archivedAt === undefined ? {} : { archivedAt: patch.archivedAt }),
            version: { increment: 1 },
          },
        });
        if (updated.count === 0) {
          const current = await tx.project.findFirst({
            where: { id, workspaceId, deletedAt: null },
          });
          return current === null
            ? { status: "not_found" }
            : { status: "conflict", currentVersion: current.version };
        }

        const row = await tx.project.findUniqueOrThrow({ where: { id } });
        const project = toProject(row);
        await this.recordChange(tx, {
          workspaceId,
          entityId: id,
          operation: "UPSERT",
          version: row.version,
          payload: toProjectPayload(project),
          actorId,
        });
        return { status: "ok", project };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { status: "name_taken" };
      }
      throw error;
    }
  }

  async remove(
    id: string,
    workspaceId: string,
    expectedVersion: number,
    actorId: string | undefined,
  ): Promise<ProjectMutationResult> {
    return this.transaction(async (tx) => {
      const existing = await tx.project.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (existing === null) {
        return { status: "not_found" };
      }
      if (existing.version !== expectedVersion) {
        return { status: "conflict", currentVersion: existing.version };
      }

      const updated = await tx.project.updateMany({
        where: { id, workspaceId, deletedAt: null, version: expectedVersion },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count === 0) {
        const current = await tx.project.findFirst({
          where: { id, workspaceId, deletedAt: null },
        });
        return current === null
          ? { status: "not_found" }
          : { status: "conflict", currentVersion: current.version };
      }

      // Les tâches du projet supprimé reviennent dans l'Inbox, dans la même
      // transaction que le tombstone : aucun client ne peut observer un projet
      // supprimé dont les tâches pointent encore vers lui. Chaque tâche voit
      // sa version avancée et son propre `SyncChange` écrit, sinon les clients
      // hors ligne garderaient l'ancien rattachement.
      const taskIds = (
        await tx.task.findMany({
          where: { workspaceId, projectId: id, deletedAt: null },
          select: { id: true },
        })
      ).map((task) => task.id);

      if (taskIds.length > 0) {
        await tx.task.updateMany({
          where: { workspaceId, id: { in: taskIds }, deletedAt: null },
          data: {
            projectId: null,
            version: { increment: 1 },
            ...(actorId === undefined ? {} : { updatedBy: actorId }),
          },
        });

        const moved = await tx.task.findMany({ where: { id: { in: taskIds } } });
        for (const taskRow of moved) {
          await tx.syncChange.create({
            data: {
              workspaceId,
              entityType: "task",
              entityId: taskRow.id,
              operation: "UPSERT",
              version: taskRow.version,
              payload: toTaskPayload(toTask(taskRow)),
              ...(actorId === undefined ? {} : { actorId }),
            },
          });
        }
      }

      const row = await tx.project.findUniqueOrThrow({ where: { id } });
      await this.recordChange(tx, {
        workspaceId,
        entityId: id,
        operation: "DELETE",
        version: row.version,
        payload: { id },
        actorId,
      });
      return { status: "ok", project: toProject(row) };
    });
  }
}
