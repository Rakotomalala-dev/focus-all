import { Injectable } from "@nestjs/common";
import type {
  DueFilter,
  Task,
  TaskDraft,
  TaskPriority,
  TaskSort,
  TaskStatus,
} from "@focus/contracts";
import { uuidV7 } from "../../common/uuid-v7";

// Entité stockée : le scope d'appartenance vit ici et nulle part ailleurs.
// Il n'apparaît jamais dans une réponse HTTP (N-7), d'où la séparation avec
// le type public `Task` du contrat.
export type StoredTask = Task & {
  readonly workspaceId: string;
  readonly deletedAt?: string;
};

// Retire le scope avant de rendre l'entité : la seule sortie autorisée est
// `Task`, donc l'oubli devient une erreur de compilation, pas une fuite.
function toTask(stored: StoredTask): Task {
  const { workspaceId, deletedAt, ...task } = stored;
  void workspaceId;
  void deletedAt;
  return task;
}

export type TaskFilters = {
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly projectId?: string;
  readonly inbox?: boolean;
  readonly parentId?: string;
  readonly tagIds?: readonly string[];
  readonly due?: DueFilter;
  readonly q?: string;
  readonly includeCompleted?: boolean;
};

// Clé de tri d'une tâche : le curseur transporte la valeur de tri et l'id,
// jamais une position, pour que la pagination reste juste quand la liste change.
export type TaskCursor = {
  readonly sort: TaskSort;
  readonly value: string | null;
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

// Champs modifiables : la clé absente ne change rien (PATCH partiel), `null`
// efface explicitement une valeur optionnelle.
export type TaskPatch = {
  readonly title?: string;
  readonly description?: string | null;
  readonly projectId?: string | null;
  readonly parentId?: string | null;
  readonly dueDate?: string | null;
  readonly dueTime?: string | null;
  readonly startDate?: string | null;
  readonly priority?: TaskPriority;
  readonly tagIds?: readonly string[];
  readonly reminders?: readonly string[];
  readonly recurrenceRule?: string | null;
  readonly recurrenceMode?: "FIXED" | "AFTER_COMPLETION";
  readonly estimateMinutes?: number | null;
  readonly status?: TaskStatus;
};

export type MutationResult =
  | { readonly status: "ok"; readonly task: Task }
  | { readonly status: "not_found" }
  | { readonly status: "conflict"; readonly currentVersion: number };

export type MutationOptions = {
  readonly id?: string;
  readonly actorId?: string;
  readonly clientMutationId?: string;
};

export interface TaskRepository {
  create(draft: TaskDraft, workspaceId: string, options?: MutationOptions): Promise<Task>;
  findById(id: string, workspaceId: string): Promise<Task | undefined>;
  list(
    filters: TaskFilters,
    workspaceId: string,
    page: TaskPage,
    sort: TaskSort,
  ): Promise<TaskPageResult>;
  update(
    id: string,
    workspaceId: string,
    patch: TaskPatch,
    expectedVersion: number,
    options?: MutationOptions,
  ): Promise<MutationResult>;
  remove(
    id: string,
    workspaceId: string,
    expectedVersion: number,
    options?: MutationOptions,
  ): Promise<MutationResult>;
  restore(id: string, workspaceId: string, options?: MutationOptions): Promise<MutationResult>;
  listDeleted(workspaceId: string): Promise<readonly Task[]>;
  reorder(ids: readonly string[], workspaceId: string, options?: MutationOptions): Promise<readonly Task[]>;
  emptyInbox(
    projectId: string,
    workspaceId: string,
    options?: MutationOptions,
  ): Promise<number>;
  snapshot(workspaceId: string): Promise<readonly Task[]>;
}

export const TASK_REPOSITORY = "TASK_REPOSITORY";

const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

export function priorityRank(priority: TaskPriority): number {
  return PRIORITY_RANK[priority];
}

export function compareTasks(left: Task, right: Task): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder < right.sortOrder ? -1 : 1;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}

export function compareBySort(sort: TaskSort): (left: Task, right: Task) => number {
  switch (sort) {
    case "DUE_DATE":
      return (left, right) => {
        if (left.dueDate !== right.dueDate) {
          if (left.dueDate === undefined) return 1;
          if (right.dueDate === undefined) return -1;
          return left.dueDate < right.dueDate ? -1 : 1;
        }
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      };
    case "PRIORITY":
      return (left, right) => {
        const delta = priorityRank(right.priority) - priorityRank(left.priority);
        if (delta !== 0) return delta;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      };
    case "CREATED_AT":
      return (left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt > right.createdAt ? -1 : 1;
        }
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      };
    case "TITLE":
      return (left, right) => {
        const delta = left.title.localeCompare(right.title, "fr");
        if (delta !== 0) return delta;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      };
    case "MANUAL":
      return compareTasks;
  }
}

function sortValue(task: Task, sort: TaskSort): string | null {
  switch (sort) {
    case "DUE_DATE":
      return task.dueDate ?? null;
    case "PRIORITY":
      return task.priority;
    case "CREATED_AT":
      return task.createdAt;
    case "TITLE":
      return task.title;
    case "MANUAL":
      return task.sortOrder;
  }
}

export function cursorOf(task: Task, sort: TaskSort): TaskCursor {
  return { sort, value: sortValue(task, sort), id: task.id };
}

// Comparaison à la clé du curseur, dans le même ordre que `compareBySort`.
export function isAfterCursor(task: Task, cursor: TaskCursor): boolean {
  const compare = compareBySort(cursor.sort);
  const reference = {
    ...task,
    sortOrder: cursor.sort === "MANUAL" ? (cursor.value ?? task.sortOrder) : task.sortOrder,
    dueDate: cursor.sort === "DUE_DATE" ? (cursor.value ?? undefined) : task.dueDate,
    priority:
      cursor.sort === "PRIORITY" ? ((cursor.value ?? task.priority) as TaskPriority) : task.priority,
    createdAt: cursor.sort === "CREATED_AT" ? (cursor.value ?? task.createdAt) : task.createdAt,
    title: cursor.sort === "TITLE" ? (cursor.value ?? task.title) : task.title,
    id: cursor.id,
  } as Task;
  return compare(task, reference) > 0;
}

// Implémentation en mémoire : elle rend la feature testable sans PostgreSQL.
@Injectable()
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, StoredTask>();
  private sequence = 0;

  static withTasks(seed: readonly StoredTask[]): InMemoryTaskRepository {
    const repository = new InMemoryTaskRepository();
    for (const task of seed) {
      repository.tasks.set(task.id, task);
    }
    repository.sequence = seed.length;
    return repository;
  }

  async create(draft: TaskDraft, workspaceId: string, options?: MutationOptions): Promise<Task> {
    const now = new Date().toISOString();
    this.sequence += 1;

    const task: StoredTask = {
      id: options?.id ?? uuidV7(),
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
      reminders: [...draft.reminders],
      recurrenceMode: draft.recurrenceMode,
      ...(draft.description === undefined ? {} : { description: draft.description }),
      ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
      ...(draft.parentId === undefined ? {} : { parentId: draft.parentId }),
      ...(draft.dueDate === undefined ? {} : { dueDate: draft.dueDate }),
      ...(draft.dueTime === undefined ? {} : { dueTime: draft.dueTime }),
      ...(draft.startDate === undefined ? {} : { startDate: draft.startDate }),
      ...(draft.recurrenceRule === undefined ? {} : { recurrenceRule: draft.recurrenceRule }),
      ...(draft.estimateMinutes === undefined ? {} : { estimateMinutes: draft.estimateMinutes }),
    };

    this.tasks.set(task.id, task);
    return toTask(task);
  }

  async findById(id: string, workspaceId: string): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    return task !== undefined && task.workspaceId === workspaceId && task.deletedAt === undefined
      ? toTask(task)
      : undefined;
  }

  async update(
    id: string,
    workspaceId: string,
    patch: TaskPatch,
    expectedVersion: number,
    _options?: MutationOptions,
  ): Promise<MutationResult> {
    const existing = this.tasks.get(id);
    if (existing === undefined || existing.workspaceId !== workspaceId || existing.deletedAt !== undefined) {
      return { status: "not_found" };
    }
    if (existing.version !== expectedVersion) {
      return { status: "conflict", currentVersion: existing.version };
    }

    const now = new Date().toISOString();
    const completedAt =
      patch.status === undefined
        ? existing.completedAt
        : patch.status === "DONE"
          ? (existing.completedAt ?? now)
          : null;

    // Les clés `null` effacent le champ ; `undefined` signifie « inchangé ».
    const optional = <T>(value: T | null | undefined, previous: T | undefined): T | undefined =>
      value === undefined ? previous : value === null ? undefined : value;

    const description = optional(patch.description, existing.description);
    const projectId = optional(patch.projectId, existing.projectId);
    const parentId = optional(patch.parentId, existing.parentId);
    const dueDate = optional(patch.dueDate, existing.dueDate);
    const dueTime = optional(patch.dueTime, existing.dueTime);
    const startDate = optional(patch.startDate, existing.startDate);
    const recurrenceRule = optional(patch.recurrenceRule, existing.recurrenceRule);
    const estimateMinutes = optional(patch.estimateMinutes, existing.estimateMinutes);

    const next: StoredTask = {
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
      reminders: patch.reminders === undefined ? existing.reminders : [...patch.reminders],
      recurrenceMode: patch.recurrenceMode ?? existing.recurrenceMode,
      ...(description === undefined ? {} : { description }),
      ...(projectId === undefined ? {} : { projectId }),
      ...(parentId === undefined ? {} : { parentId }),
      ...(dueDate === undefined ? {} : { dueDate }),
      ...(dueTime === undefined ? {} : { dueTime }),
      ...(startDate === undefined ? {} : { startDate }),
      ...(recurrenceRule === undefined ? {} : { recurrenceRule }),
      ...(estimateMinutes === undefined ? {} : { estimateMinutes }),
    };

    this.tasks.set(id, next);
    return { status: "ok", task: toTask(next) };
  }

  async remove(
    id: string,
    workspaceId: string,
    expectedVersion: number,
    _options?: MutationOptions,
  ): Promise<MutationResult> {
    const existing = this.tasks.get(id);
    if (existing === undefined || existing.workspaceId !== workspaceId || existing.deletedAt !== undefined) {
      return { status: "not_found" };
    }
    if (existing.version !== expectedVersion) {
      return { status: "conflict", currentVersion: existing.version };
    }

    const now = new Date().toISOString();
    this.tasks.set(id, { ...existing, version: existing.version + 1, deletedAt: now });
    for (const [childId, child] of this.tasks) {
      if (child.parentId === id && child.workspaceId === workspaceId && child.deletedAt === undefined) {
        this.tasks.set(childId, { ...child, version: child.version + 1, deletedAt: now });
      }
    }
    return { status: "ok", task: toTask(existing) };
  }

  async restore(id: string, workspaceId: string, _options?: MutationOptions): Promise<MutationResult> {
    const existing = this.tasks.get(id);
    if (existing === undefined || existing.workspaceId !== workspaceId) {
      return { status: "not_found" };
    }
    const now = new Date().toISOString();
    const restored: StoredTask = {
      ...existing,
      version: existing.version + 1,
      updatedAt: now,
    };
    delete (restored as { deletedAt?: string }).deletedAt;
    this.tasks.set(id, restored);
    // Un parent supprimé avait supprimé ses enfants : la restauration les
    // remet ensemble pour ne pas laisser de sous-tâches orphelines.
    for (const [childId, child] of this.tasks) {
      if (child.parentId === id && child.workspaceId === workspaceId) {
        const childRestored: StoredTask = { ...child, version: child.version + 1, updatedAt: now };
        delete (childRestored as { deletedAt?: string }).deletedAt;
        this.tasks.set(childId, childRestored);
      }
    }
    return { status: "ok", task: toTask(restored) };
  }

  async listDeleted(workspaceId: string): Promise<readonly Task[]> {
    return [...this.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId && task.deletedAt !== undefined)
      .sort((left, right) => (left.deletedAt ?? "") < (right.deletedAt ?? "") ? 1 : -1)
      .map(toTask);
  }

  async reorder(
    ids: readonly string[],
    workspaceId: string,
    _options?: MutationOptions,
  ): Promise<readonly Task[]> {
    const now = new Date().toISOString();
    const updated: Task[] = [];
    ids.forEach((id, index) => {
      const existing = this.tasks.get(id);
      if (existing === undefined || existing.workspaceId !== workspaceId || existing.deletedAt !== undefined) {
        return;
      }
      const next: StoredTask = {
        ...existing,
        sortOrder: `${(index + 1).toString(36).padStart(6, "0")}`,
        version: existing.version + 1,
        updatedAt: now,
      };
      this.tasks.set(id, next);
      updated.push(toTask(next));
    });
    return updated;
  }

  async emptyInbox(
    projectId: string,
    workspaceId: string,
    _options?: MutationOptions,
  ): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    for (const [id, task] of this.tasks) {
      if (
        task.workspaceId === workspaceId &&
        task.deletedAt === undefined &&
        task.projectId === undefined &&
        task.parentId === undefined
      ) {
        this.tasks.set(id, { ...task, projectId, version: task.version + 1, updatedAt: now });
        count += 1;
      }
    }
    return count;
  }

  async snapshot(workspaceId: string): Promise<readonly Task[]> {
    return [...this.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId && task.deletedAt === undefined)
      .sort(compareTasks)
      .map(toTask);
  }

  async list(
    filters: TaskFilters,
    workspaceId: string,
    page: TaskPage,
    sort: TaskSort,
  ): Promise<TaskPageResult> {
    const today = new Date().toISOString().slice(0, 10);
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const matching = [...this.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId && task.deletedAt === undefined)
      .filter((task) => filters.status === undefined || task.status === filters.status)
      .filter((task) => filters.priority === undefined || task.priority === filters.priority)
      .filter((task) => filters.projectId === undefined || task.projectId === filters.projectId)
      .filter((task) => filters.inbox !== true || task.projectId === undefined)
      .filter((task) => filters.parentId === undefined || task.parentId === filters.parentId)
      .filter(
        (task) =>
          filters.tagIds === undefined ||
          filters.tagIds.every((tagId) => task.tagIds.includes(tagId)),
      )
      .filter(
        (task) =>
          filters.includeCompleted === true ||
          filters.status !== undefined ||
          (task.status !== "DONE" && task.status !== "CANCELLED"),
      )
      .filter((task) => {
        if (filters.due === undefined) return true;
        if (filters.due === "NONE") return task.dueDate === undefined;
        if (task.dueDate === undefined) return false;
        if (filters.due === "OVERDUE") return task.dueDate < today;
        if (filters.due === "TODAY") return task.dueDate === today;
        return task.dueDate >= today && task.dueDate <= inSevenDays;
      })
      .filter(
        (task) =>
          filters.q === undefined ||
          `${task.title} ${task.description ?? ""}`
            .toLocaleLowerCase("fr")
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .includes(
              filters.q
                .toLocaleLowerCase("fr")
                .normalize("NFD")
                .replace(/\p{Diacritic}/gu, ""),
            ),
      )
      .sort(compareBySort(sort))
      .filter((task) => page.after === undefined || isAfterCursor(task, page.after));

    const window = matching.slice(0, page.limit + 1);

    return {
      items: window.slice(0, page.limit).map(toTask),
      hasMore: window.length > page.limit,
    };
  }
}
