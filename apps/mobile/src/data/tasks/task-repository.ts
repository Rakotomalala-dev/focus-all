import {
  taskDraftSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskSchema,
  taskUpdateSchema,
  trashResponseSchema,
  type Task,
  type TaskDraftInput,
  type TaskListQuery,
  type TaskListResponse,
  type TaskStatus,
  type TaskUpdate,
  type TrashResponse,
} from "@focus/contracts";
import type { HttpClient, HttpQuery } from "../http/client";

// Un repository par ressource : la feature ne connaît ni Axios ni les chemins
// (doc 01 §7.3), et chaque réponse est validée par le contrat partagé.
export const TASKS_PATH = "/tasks";

export type TaskPatchInput = Omit<TaskUpdate, "version">;

export type TaskRepository = {
  readonly list: (query?: TaskListQuery) => Promise<TaskListResponse>;
  readonly findById: (id: string) => Promise<Task>;
  readonly create: (draft: TaskDraftInput) => Promise<Task>;
  readonly setStatus: (task: Task, status: TaskStatus) => Promise<Task>;
  readonly update: (task: Task, patch: TaskPatchInput) => Promise<Task>;
  readonly remove: (task: Task) => Promise<void>;
  readonly restore: (id: string) => Promise<Task>;
  readonly reorder: (ids: readonly string[]) => Promise<readonly Task[]>;
  readonly emptyInbox: (projectId: string) => Promise<{ moved: number }>;
  readonly trash: () => Promise<TrashResponse>;
};

const NO_CONTENT = { parse: (): void => undefined };
const MOVED_SCHEMA = {
  parse: (value: unknown): { moved: number } => {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { moved?: unknown }).moved !== "number"
    ) {
      throw new Error("Réponse inbox invalide");
    }
    return { moved: (value as { moved: number }).moved };
  },
};

export function createTaskRepository(http: HttpClient): TaskRepository {
  return {
    list: (query = taskListQuerySchema.parse({})) =>
      http.get(TASKS_PATH, taskListResponseSchema, toQueryParams(query)),

    findById: (id) => http.get(`${TASKS_PATH}/${id}`, taskSchema),

    create: async (draft) => {
      const payload = taskDraftSchema.parse(draft);
      return http.post(TASKS_PATH, payload, taskSchema);
    },

    setStatus: async (task, status) => {
      const payload = taskUpdateSchema.parse({ status, version: task.version });
      return http.patch(`${TASKS_PATH}/${task.id}`, payload, taskSchema);
    },

    update: async (task, patch) => {
      const payload = taskUpdateSchema.parse({ ...patch, version: task.version });
      return http.patch(`${TASKS_PATH}/${task.id}`, payload, taskSchema);
    },

    remove: (task) =>
      http.delete(`${TASKS_PATH}/${task.id}`, NO_CONTENT, { version: task.version }),

    restore: (id) => http.post(`${TASKS_PATH}/${id}/restore`, undefined, taskSchema),

    reorder: (ids) =>
      http.patch(`${TASKS_PATH}/order`, { ids }, {
        parse: (value: unknown) => {
          if (!Array.isArray(value)) {
            throw new Error("Réponse de réordonnancement invalide");
          }
          return value.map((item) => taskSchema.parse(item));
        },
      }),

    emptyInbox: (projectId) =>
      http.post(`${TASKS_PATH}/inbox/empty`, { projectId }, MOVED_SCHEMA),

    trash: () => http.get(`${TASKS_PATH}/trash`, trashResponseSchema),
  };
}

function toQueryParams(query: TaskListQuery): HttpQuery {
  const params: Record<string, string | number | boolean> = {
    limit: query.limit,
    sort: query.sort,
  };
  if (query.cursor !== undefined) params.cursor = query.cursor;
  if (query.status !== undefined) params.status = query.status;
  if (query.priority !== undefined) params.priority = query.priority;
  if (query.projectId !== undefined) params.projectId = query.projectId;
  if (query.inbox !== undefined) params.inbox = query.inbox;
  if (query.parentId !== undefined) params.parentId = query.parentId;
  if (query.tagIds !== undefined) params.tagIds = query.tagIds.join(",");
  if (query.due !== undefined) params.due = query.due;
  if (query.q !== undefined) params.q = query.q;
  if (query.includeCompleted !== undefined) {
    params.includeCompleted = query.includeCompleted;
  }
  return params;
}
