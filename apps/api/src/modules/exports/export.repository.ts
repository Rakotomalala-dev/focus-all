import { Inject, Injectable } from "@nestjs/common";
import type { ExportJobStatus } from "@focus/contracts";
import type { ExportStatus, Prisma } from "@prisma/client";
import { uuidV7 } from "../../common/uuid-v7";
import { PrismaService } from "../../database/prisma.service";

export const EXPORT_STORE = "EXPORT_STORE";

export type StoredExportJob = {
  readonly id: string;
  readonly userId: string;
  readonly status: ExportJobStatus;
  readonly payload: unknown | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly expiresAt: Date | null;
};

export type ExportData = {
  readonly projects: readonly unknown[];
  readonly tasks: readonly unknown[];
  readonly tags: readonly unknown[];
};

export interface ExportStore {
  create(userId: string, id: string, now: Date): Promise<StoredExportJob>;
  findForUser(id: string, userId: string): Promise<StoredExportJob | undefined>;
  claimNext(): Promise<StoredExportJob | undefined>;
  complete(id: string, payload: unknown, expiresAt: Date): Promise<void>;
  fail(id: string, reason: string): Promise<void>;
  expire(id: string): Promise<void>;
  loadData(userId: string): Promise<ExportData>;
  pushTokens(userId: string): Promise<readonly string[]>;
}

type JobRow = {
  readonly id: string;
  readonly userId: string;
  readonly status: ExportStatus;
  readonly payload: Prisma.JsonValue | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly expiresAt: Date | null;
};

function toJob(row: JobRow): StoredExportJob {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    payload: row.payload,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
  };
}

@Injectable()
export class PrismaExportStore implements ExportStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(userId: string, id: string, now: Date): Promise<StoredExportJob> {
    const row = await this.prisma.exportJob.create({
      data: { id, userId, status: "PENDING", createdAt: now },
    });
    return toJob(row);
  }

  async findForUser(id: string, userId: string): Promise<StoredExportJob | undefined> {
    const row = await this.prisma.exportJob.findFirst({ where: { id, userId } });
    return row === null ? undefined : toJob(row);
  }

  async claimNext(): Promise<StoredExportJob | undefined> {
    const candidate = await this.prisma.exportJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    if (candidate === null) {
      return undefined;
    }
    const claimed = await this.prisma.exportJob.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: { status: "PROCESSING", startedAt: new Date() },
    });
    if (claimed.count === 0) {
      return undefined;
    }
    return toJob({ ...candidate, status: "PROCESSING" });
  }

  async complete(id: string, payload: unknown, expiresAt: Date): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id },
      data: {
        status: "READY",
        // Le payload est déjà validé par `accountExportSchema` (objet JSON pur).
        payload: payload as Prisma.InputJsonValue,
        completedAt: new Date(),
        expiresAt,
      },
    });
  }

  async fail(id: string, reason: string): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id },
      data: { status: "FAILED", error: reason.slice(0, 500) },
    });
  }

  async expire(id: string): Promise<void> {
    await this.prisma.exportJob.update({ where: { id }, data: { status: "EXPIRED" } });
  }

  async loadData(userId: string): Promise<ExportData> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    const workspaceIds = memberships.map((membership) => membership.workspaceId);
    if (workspaceIds.length === 0) {
      return { projects: [], tasks: [], tags: [] };
    }
    const [projects, tasks, tags] = await Promise.all([
      this.prisma.project.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.task.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.tag.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { projects, tasks, tags };
  }

  async pushTokens(userId: string): Promise<readonly string[]> {
    const rows = await this.prisma.device.findMany({
      where: { userId, notificationsEnabled: true, pushToken: { not: null } },
      select: { pushToken: true },
    });
    return rows
      .map((row) => row.pushToken)
      .filter((token): token is string => token !== null);
  }
}

export function newExportId(): string {
  return uuidV7();
}
