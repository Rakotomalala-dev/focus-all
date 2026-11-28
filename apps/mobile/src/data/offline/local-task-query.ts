import type {
  Task,
  TaskListQuery,
  TaskListResponse,
  TaskPriority,
  TaskSort,
} from "@focus/contracts";

// Le serveur reste l'autorité des vues et de la pagination par curseur. Quand le
// réseau manque, le miroir local reproduit les filtres et le tri de la liste de
// tâches (RF-61) pour que l'écran garde son contenu au lieu d'afficher une
// erreur réseau. Seule la première page est servie hors ligne.
const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function compareBy(sort: TaskSort): (left: Task, right: Task) => number {
  switch (sort) {
    case "DUE_DATE":
      return (left, right) => {
        if (left.dueDate !== right.dueDate) {
          if (left.dueDate === undefined) return 1;
          if (right.dueDate === undefined) return -1;
          return left.dueDate < right.dueDate ? -1 : 1;
        }
        return compareIds(left, right);
      };
    case "PRIORITY":
      return (left, right) => {
        const delta = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
        return delta === 0 ? compareIds(left, right) : delta;
      };
    case "CREATED_AT":
      return (left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt > right.createdAt ? -1 : 1;
        }
        return compareIds(left, right);
      };
    case "TITLE":
      return (left, right) => {
        const delta = left.title.localeCompare(right.title, "fr");
        return delta === 0 ? compareIds(left, right) : delta;
      };
    case "MANUAL":
      return (left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder < right.sortOrder ? -1 : 1;
        }
        return compareIds(left, right);
      };
  }
}

function compareIds(left: Task, right: Task): number {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function matchesQuery(task: Task, query: TaskListQuery, today: string): boolean {
  if (query.status !== undefined && task.status !== query.status) return false;
  if (query.priority !== undefined && task.priority !== query.priority) return false;
  if (query.projectId !== undefined && task.projectId !== query.projectId) return false;
  if (query.inbox === true && task.projectId !== undefined) return false;
  if (query.parentId !== undefined && task.parentId !== query.parentId) return false;

  const tagIds = query.tagIds ?? [];
  if (!tagIds.every((tagId) => task.tagIds.includes(tagId))) return false;

  const isCompleted = task.status === "DONE" || task.status === "CANCELLED";
  if (query.includeCompleted !== true && query.status === undefined && isCompleted) {
    return false;
  }

  if (query.due !== undefined) {
    if (query.due === "NONE") {
      if (task.dueDate !== undefined) return false;
    } else {
      if (task.dueDate === undefined) return false;
      const inSevenDays = addDays(today, 6);
      if (query.due === "OVERDUE" && !(task.dueDate < today)) return false;
      if (query.due === "TODAY" && task.dueDate !== today) return false;
      if (
        query.due === "NEXT_7_DAYS" &&
        !(task.dueDate >= today && task.dueDate <= inSevenDays)
      ) {
        return false;
      }
    }
  }

  if (query.q !== undefined) {
    const haystack = normalize(`${task.title} ${task.description ?? ""}`);
    if (!haystack.includes(normalize(query.q))) return false;
  }

  return true;
}

export function selectCachedTasks(
  tasks: readonly Task[],
  query: TaskListQuery,
  today: string,
): TaskListResponse {
  const matching = tasks
    .filter((task) => matchesQuery(task, query, today))
    .sort(compareBy(query.sort));

  return {
    items: matching.slice(0, query.limit),
    nextCursor: null,
  };
}
