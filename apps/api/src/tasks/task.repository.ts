import { Injectable } from "@nestjs/common";
import type { Task, TaskDraft, TaskStatus } from "@focus/contracts";
import { uuidV7 } from "../common/uuid-v7";

export type TaskFilters = {
  readonly status?: TaskStatus;
  readonly projectId?: string;
};

export type TaskPage = {
  readonly offset: number;
  readonly limit: number;
};

export type TaskPageResult = {
  readonly items: readonly Task[];
  readonly total: number;
};

// Port du repository (N-1/N-2) : le service ne connaît ni Prisma ni le stockage.
// Le remplacement par un repository Prisma se fera sans toucher au service.
export interface TaskRepository {
  create(draft: TaskDraft, workspaceId: string): Promise<Task>;
  findById(id: string, workspaceId: string): Promise<Task | undefined>;
  list(filters: TaskFilters, workspaceId: string, page: TaskPage): Promise<TaskPageResult>;
}

export const TASK_REPOSITORY = "TASK_REPOSITORY";

// Implémentation en mémoire : elle rend la feature testable sans PostgreSQL.
// Elle est volontairement limitée (pas de persistance, pas de transaction) et
// sera remplacée par le repository Prisma quand la base sera branchée.
@Injectable()
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();
  private sequence = 0;

  async create(draft: TaskDraft, workspaceId: string): Promise<Task> {
    const now = new Date().toISOString();
    this.sequence += 1;

    const task: Task = {
      id: uuidV7(),
      workspaceId,
      title: draft.title,
      priority: draft.priority,
      status: "TODO",
      sortOrder: `${this.sequence.toString(36).padStart(6, "0")}`,
      version: 0,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      tagIds: [...draft.tagIds],
      ...(draft.description === undefined ? {} : { description: draft.description }),
      ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
      ...(draft.dueDate === undefined ? {} : { dueDate: draft.dueDate }),
    };

    this.tasks.set(task.id, task);
    return task;
  }

  async findById(id: string, workspaceId: string): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    // Scope par workspace systématique (N-3) : une tâche d'un autre workspace
    // est indistinguable d'une tâche absente.
    return task !== undefined && task.workspaceId === workspaceId ? task : undefined;
  }

  async list(filters: TaskFilters, workspaceId: string, page: TaskPage): Promise<TaskPageResult> {
    const matching = [...this.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId)
      .filter((task) => filters.status === undefined || task.status === filters.status)
      .filter((task) => filters.projectId === undefined || task.projectId === filters.projectId)
      .sort((left, right) => left.sortOrder.localeCompare(right.sortOrder));

    return {
      items: matching.slice(page.offset, page.offset + page.limit),
      total: matching.length,
    };
  }
}
