import { Injectable } from "@nestjs/common";
import type { Task, TaskDraft, TaskPriority, TaskStatus } from "@focus/contracts";
import { uuidV7 } from "../common/uuid-v7";

export type TaskFilters = {
  readonly status?: TaskStatus;
  readonly projectId?: string;
};

// Clé de tri d'une tâche : (sortOrder, id). Le curseur transporte cette clé,
// jamais une position, pour que la pagination reste juste quand la liste change.
export type TaskCursor = {
  readonly sortOrder: string;
  readonly id: string;
};

export type TaskPage = {
  readonly limit: number;
  readonly after?: TaskCursor;
};

export type TaskPageResult = {
  readonly items: readonly Task[];
  readonly hasMore: boolean;
};

// Champs modifiables : la clé absente ne change rien (PATCH partiel).
export type TaskPatch = {
  readonly title?: string;
  readonly description?: string;
  readonly projectId?: string;
  readonly dueDate?: string;
  readonly priority?: TaskPriority;
  readonly tagIds?: readonly string[];
  readonly status?: TaskStatus;
};

// Résultat explicite d'une mutation : le service traduit `conflict` en 409
// plutôt que de deviner à partir d'une valeur nulle.
export type MutationResult =
  | { readonly status: "ok"; readonly task: Task }
  | { readonly status: "not_found" }
  | { readonly status: "conflict"; readonly currentVersion: number };

// Port du repository (N-1/N-2) : le service ne connaît ni Prisma ni le stockage.
// Le remplacement par un repository Prisma se fera sans toucher au service.
export interface TaskRepository {
  create(draft: TaskDraft, workspaceId: string): Promise<Task>;
  findById(id: string, workspaceId: string): Promise<Task | undefined>;
  list(filters: TaskFilters, workspaceId: string, page: TaskPage): Promise<TaskPageResult>;
  update(
    id: string,
    workspaceId: string,
    patch: TaskPatch,
    expectedVersion: number,
  ): Promise<MutationResult>;
  remove(id: string, workspaceId: string, expectedVersion: number): Promise<MutationResult>;
}

export const TASK_REPOSITORY = "TASK_REPOSITORY";

export function compareTasks(left: Task, right: Task): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder < right.sortOrder ? -1 : 1;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}

// Comparaison stricte avec la clé du curseur, dans le même ordre que
// `compareTasks` : (sortOrder, puis id pour départager deux clés égales).
export function isAfterCursor(task: Task, cursor: TaskCursor): boolean {
  if (task.sortOrder !== cursor.sortOrder) {
    return task.sortOrder > cursor.sortOrder;
  }
  return task.id > cursor.id;
}

// Implémentation en mémoire : elle rend la feature testable sans PostgreSQL.
@Injectable()
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();
  private sequence = 0;

  // Fabrique réservée aux tests : elle peuple une liste dont l'ordre est
  // connu (insertion avant le curseur, clés de tri égales). Le constructeur
  // doit rester sans paramètre, sinon Nest tente d'injecter `Array`
  // (`design:paramtypes`) et refuse de démarrer l'application.
  static withTasks(seed: readonly Task[]): InMemoryTaskRepository {
    const repository = new InMemoryTaskRepository();
    for (const task of seed) {
      repository.tasks.set(task.id, task);
    }
    repository.sequence = seed.length;
    return repository;
  }

  async create(draft: TaskDraft, workspaceId: string): Promise<Task> {
    const now = new Date().toISOString();
    this.sequence += 1;

    const task: Task = {
      id: uuidV7(),
      workspaceId,
      title: draft.title,
      priority: draft.priority,
      status: "TODO",
      // Clé de tri croissante : une tâche créée se place toujours en fin de liste.
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

  async update(
    id: string,
    workspaceId: string,
    patch: TaskPatch,
    expectedVersion: number,
  ): Promise<MutationResult> {
    const existing = this.tasks.get(id);
    if (existing === undefined || existing.workspaceId !== workspaceId) {
      return { status: "not_found" };
    }
    if (existing.version !== expectedVersion) {
      return { status: "conflict", currentVersion: existing.version };
    }

    const now = new Date().toISOString();
    // Le passage à DONE horodate la complétion ; en sortir l'efface
    // (doc 02, RF tâches). La règle vit ici car le repository détient l'entité.
    const completedAt =
      patch.status === undefined
        ? existing.completedAt
        : patch.status === "DONE"
          ? (existing.completedAt ?? now)
          : null;

    // Chaque champ requis est réassigné explicitement : étaler un `TaskPatch`
    // dont les clés sont optionnelles rendrait `next` non assignable à `Task`.
    // Les champs optionnels sont ajoutés seulement quand ils ont une valeur
    // (`exactOptionalPropertyTypes` interdit de les mettre à `undefined`).
    const description = patch.description ?? existing.description;
    const projectId = patch.projectId ?? existing.projectId;
    const dueDate = patch.dueDate ?? existing.dueDate;

    const next: Task = {
      id: existing.id,
      workspaceId: existing.workspaceId,
      title: patch.title ?? existing.title,
      priority: patch.priority ?? existing.priority,
      status: patch.status ?? existing.status,
      sortOrder: existing.sortOrder,
      version: existing.version + 1,
      completedAt,
      createdAt: existing.createdAt,
      updatedAt: now,
      tagIds: patch.tagIds === undefined ? existing.tagIds : [...patch.tagIds],
      ...(description === undefined ? {} : { description }),
      ...(projectId === undefined ? {} : { projectId }),
      ...(dueDate === undefined ? {} : { dueDate }),
    };

    this.tasks.set(id, next);
    return { status: "ok", task: next };
  }

  async remove(id: string, workspaceId: string, expectedVersion: number): Promise<MutationResult> {
    const existing = this.tasks.get(id);
    if (existing === undefined || existing.workspaceId !== workspaceId) {
      return { status: "not_found" };
    }
    if (existing.version !== expectedVersion) {
      return { status: "conflict", currentVersion: existing.version };
    }

    this.tasks.delete(id);
    return { status: "ok", task: existing };
  }

  async list(filters: TaskFilters, workspaceId: string, page: TaskPage): Promise<TaskPageResult> {
    const matching = [...this.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId)
      .filter((task) => filters.status === undefined || task.status === filters.status)
      .filter((task) => filters.projectId === undefined || task.projectId === filters.projectId)
      .sort(compareTasks)
      .filter((task) => page.after === undefined || isAfterCursor(task, page.after));

    // Un élément de plus que demandé : c'est ce qui révèle `hasMore` sans
    // compter la collection entière.
    const window = matching.slice(0, page.limit + 1);

    return {
      items: window.slice(0, page.limit),
      hasMore: window.length > page.limit,
    };
  }
}
