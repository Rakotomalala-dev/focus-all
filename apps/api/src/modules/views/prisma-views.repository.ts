import { Inject, Injectable } from "@nestjs/common";
import type { Project } from "@focus/contracts";
import { PrismaService } from "../../database/prisma.service";
import { toTask } from "../tasks/task.mapper";
import type { SubtaskSummary, ViewTaskRow, ViewsRepository } from "./views.repository";

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

@Injectable()
export class PrismaViewsRepository implements ViewsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async tasksForWindow(
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<readonly ViewTaskRow[]> {
    const start = toDateOnly(from);
    const end = toDateOnly(to);
    const afterEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);

    const rows = await this.prisma.task.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        // Les sous-tâches ne sont jamais des cartes de vue : elles sont
        // comptées par `subtasks()` et restent dans le détail de la tâche.
        parentId: null,
        OR: [
          { dueDate: { gte: start, lte: end } },
          { dueDate: { lt: start }, status: { notIn: ["DONE", "CANCELLED"] } },
          { pinnedAt: { not: null }, status: { notIn: ["DONE", "CANCELLED"] } },
          { status: "IN_PROGRESS" },
          { completedAt: { gte: start, lt: afterEnd } },
          { recurrenceRule: { not: null }, dueDate: { lte: end } },
        ],
      },
      include: { project: { select: { name: true } } },
    });

    return rows.map((row) => ({
      task: toTask(row),
      projectName: row.project?.name ?? null,
      boardOrder: row.boardOrder === null ? null : row.boardOrder.toFixed(15),
    }));
  }

  async kanbanTasks(
    workspaceId: string,
    projectId: string,
  ): Promise<readonly ViewTaskRow[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        parentId: null,
        status: { in: ["TODO", "IN_PROGRESS", "DONE"] },
      },
      orderBy: [
        { boardOrder: { sort: "asc", nulls: "last" } },
        { sortOrder: "asc" },
        { id: "asc" },
      ],
      include: { project: { select: { name: true } } },
    });

    return rows.map((row) => ({
      task: toTask(row),
      projectName: row.project?.name ?? null,
      boardOrder: row.boardOrder === null ? null : row.boardOrder.toFixed(15),
    }));
  }

  async subtasks(
    workspaceId: string,
    parentIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubtaskSummary>> {
    const summary = new Map<string, { total: number; done: number }>();
    if (parentIds.length === 0) {
      return summary;
    }

    const groups = await this.prisma.task.groupBy({
      by: ["parentId", "status"],
      where: {
        workspaceId,
        deletedAt: null,
        parentId: { in: [...parentIds] },
      },
      _count: { _all: true },
    });

    for (const group of groups) {
      if (group.parentId === null) continue;
      const current = summary.get(group.parentId) ?? { total: 0, done: 0 };
      current.total += group._count._all;
      if (group.status === "DONE") {
        current.done += group._count._all;
      }
      summary.set(group.parentId, current);
    }

    return summary;
  }

  async findProject(
    workspaceId: string,
    projectId: string,
  ): Promise<Project | undefined> {
    const row = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId, deletedAt: null },
    });
    return row === null
      ? undefined
      : {
          id: row.id,
          name: row.name,
          color: row.color as Project["color"],
          description: row.description,
          sortOrder: row.sortOrder.toFixed(15),
          archivedAt: row.archivedAt?.toISOString() ?? null,
          version: row.version,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
  }
}
