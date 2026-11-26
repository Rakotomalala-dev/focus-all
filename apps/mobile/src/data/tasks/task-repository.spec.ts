import { taskListResponseSchema, type Task } from "@focus/contracts";
import { describe, expect, it } from "vitest";
import type { HttpClient, HttpQuery, ResponseSchema } from "../http/client";
import { createTaskRepository, TASKS_PATH } from "./task-repository";

const TASK: Task = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  title: "Acheter du pain",
  priority: "NONE",
  tagIds: [],
  status: "TODO",
  completedAt: null,
  sortOrder: "a0",
  version: 3,
  createdAt: "2026-11-25T09:00:00Z",
  updatedAt: "2026-11-25T09:00:00Z",
};

type RecordedCall = {
  readonly method: "get" | "post" | "patch" | "delete";
  readonly path: string;
  readonly body?: unknown;
  readonly query?: HttpQuery;
};

// Le faux client valide la réponse avec le schéma fourni, exactement comme le
// vrai client : un repository qui passerait le mauvais contrat échouerait ici.
function createRecordingClient(response: unknown) {
  const calls: RecordedCall[] = [];
  const reply = <T>(schema: ResponseSchema<T>): T => schema.parse(response);

  const client: HttpClient = {
    get: async (path, schema, query) => {
      calls.push({ method: "get", path, ...(query === undefined ? {} : { query }) });
      return reply(schema);
    },
    post: async (path, body, schema) => {
      calls.push({ method: "post", path, body });
      return reply(schema);
    },
    patch: async (path, body, schema) => {
      calls.push({ method: "patch", path, body });
      return reply(schema);
    },
    delete: async (path, schema, query) => {
      calls.push({ method: "delete", path, ...(query === undefined ? {} : { query }) });
      return reply(schema);
    },
  };

  return { client, calls };
}

describe("taskRepository", () => {
  it("liste les tâches avec la pagination par défaut du contrat", async () => {
    const { client, calls } = createRecordingClient(
      taskListResponseSchema.parse({ items: [TASK], nextCursor: null }),
    );

    const page = await createTaskRepository(client).list();

    expect(calls).toEqual([{ method: "get", path: TASKS_PATH, query: { limit: 50 } }]);
    expect(page.items).toHaveLength(1);
  });

  it("transmet le curseur et les filtres sans paramètre vide", async () => {
    const { client, calls } = createRecordingClient({ items: [], nextCursor: null });

    await createTaskRepository(client).list({ limit: 10, cursor: "abc", status: "TODO" });

    expect(calls[0]).toEqual({
      method: "get",
      path: TASKS_PATH,
      query: { limit: 10, cursor: "abc", status: "TODO" },
    });
  });

  it("applique les défauts du contrat avant de créer", async () => {
    const { client, calls } = createRecordingClient(TASK);

    const created = await createTaskRepository(client).create({ title: "Acheter du pain" });

    expect(calls[0]).toEqual({
      method: "post",
      path: TASKS_PATH,
      body: { title: "Acheter du pain", priority: "NONE", tagIds: [] },
    });
    expect(created.id).toBe(TASK.id);
  });

  it("envoie le statut et la version attendue pour une complétion", async () => {
    const { client, calls } = createRecordingClient(TASK);

    await createTaskRepository(client).setStatus(TASK, "DONE");

    expect(calls[0]).toEqual({
      method: "patch",
      path: `${TASKS_PATH}/${TASK.id}`,
      body: { status: "DONE", version: 3 },
    });
  });
});
