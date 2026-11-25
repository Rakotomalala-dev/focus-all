import {
  taskDraftSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskSchema,
  taskUpdateSchema,
  type Task,
  type TaskDraftInput,
  type TaskListQuery,
  type TaskListResponse,
  type TaskStatus,
} from "@focus/contracts";
import type { HttpClient, HttpQuery } from "../http/client";

// Un repository par ressource : la feature ne connaît ni Axios ni les chemins
// (doc 01 §7.3), et chaque réponse est validée par le contrat partagé.
export const TASKS_PATH = "/tasks";

export type TaskRepository = {
  readonly list: (query?: TaskListQuery) => Promise<TaskListResponse>;
  readonly create: (draft: TaskDraftInput) => Promise<Task>;
  readonly setStatus: (task: Task, status: TaskStatus) => Promise<Task>;
};

export function createTaskRepository(http: HttpClient): TaskRepository {
  return {
    list: (query = taskListQuerySchema.parse({})) =>
      http.get(TASKS_PATH, taskListResponseSchema, toQueryParams(query)),

    create: async (draft) => {
      // Les défauts du contrat (priorité NONE, tagIds vides) sont appliqués
      // avant l'envoi : le serveur les applique aussi, le client reste explicite.
      const payload = taskDraftSchema.parse(draft);
      return http.post(TASKS_PATH, payload, taskSchema);
    },

    setStatus: async (task, status) => {
      // La version du corps suffit : le serveur répond 409 CONFLICT_VERSION si
      // elle est obsolète, sans dépendre d'un ETag mémorisé côté client.
      const payload = taskUpdateSchema.parse({ status, version: task.version });
      return http.patch(`${TASKS_PATH}/${task.id}`, payload, taskSchema);
    },
  };
}

function toQueryParams(query: TaskListQuery): HttpQuery {
  const params: Record<string, string | number> = { limit: query.limit };
  if (query.cursor !== undefined) {
    params.cursor = query.cursor;
  }
  if (query.status !== undefined) {
    params.status = query.status;
  }
  if (query.projectId !== undefined) {
    params.projectId = query.projectId;
  }
  return params;
}
