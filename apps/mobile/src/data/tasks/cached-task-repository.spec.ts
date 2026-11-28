import {
  taskListQuerySchema,
  taskListResponseSchema,
  taskSchema,
  type Task,
} from "@focus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../http/app-error";
import { createOfflineStore } from "../offline/offline-store";
import { createMemoryStoragePort } from "../offline/storage-port";
import { createCachedTaskRepository } from "./cached-task-repository";
import type { TaskRepository } from "./task-repository";

const TODAY = "2026-11-28";
const SYNCED_AT = "2026-11-28T10:00:00.000Z";

function buildTask(id: string, overrides: Partial<Task> = {}): Task {
  return taskSchema.parse({
    id,
    title: "Tâche",
    status: "TODO",
    completedAt: null,
    pinned: false,
    sortOrder: "a0",
    version: 1,
    createdAt: "2026-11-25T09:00:00Z",
    updatedAt: "2026-11-25T09:00:00Z",
    ...overrides,
  });
}

const TODAY_TASK = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e31", {
  title: "Aujourd'hui",
  dueDate: TODAY,
});
const OTHER_TASK = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e32", {
  title: "Plus tard",
  dueDate: "2026-12-10",
});

function notConfigured(): Promise<never> {
  return Promise.reject(new Error("méthode non configurée dans ce test"));
}

function remoteStub(overrides: Partial<TaskRepository>): TaskRepository {
  return {
    list: notConfigured,
    findById: notConfigured,
    create: notConfigured,
    setStatus: notConfigured,
    update: notConfigured,
    remove: notConfigured,
    restore: notConfigured,
    reorder: notConfigured,
    emptyInbox: notConfigured,
    trash: notConfigured,
    ...overrides,
  };
}

function networkError(): AppError {
  return new AppError({ isNetworkError: true });
}

describe("cachedTaskRepository", () => {
  it("alimente le miroir à chaque lecture réseau réussie", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    const page = taskListResponseSchema.parse({ items: [TODAY_TASK], nextCursor: null });
    const repository = createCachedTaskRepository(
      remoteStub({ list: async () => page }),
      store,
      () => TODAY,
    );

    const result = await repository.list(taskListQuerySchema.parse({}));

    expect(result).toEqual(page);
    expect(await store.readStatus()).toMatchObject({ taskCount: 1 });
  });

  it("sert la copie locale filtrée quand le réseau manque", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({
      tasks: [TODAY_TASK, OTHER_TASK],
      projects: [],
      tags: [],
      cursor: 5,
      syncedAt: SYNCED_AT,
    });
    const repository = createCachedTaskRepository(
      remoteStub({
        list: async () => {
          throw networkError();
        },
      }),
      store,
      () => TODAY,
    );

    const result = await repository.list(
      taskListQuerySchema.parse({ due: "TODAY", limit: 10 }),
    );

    expect(result.nextCursor).toBeNull();
    expect(result.items.map((task) => task.id)).toEqual([TODAY_TASK.id]);
  });

  it("propage l'erreur réseau quand aucun instantané n'a encore été téléchargé", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    const repository = createCachedTaskRepository(
      remoteStub({
        list: async () => {
          throw networkError();
        },
      }),
      store,
      () => TODAY,
    );

    await expect(repository.list(taskListQuerySchema.parse({}))).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("retrouve une tâche dans le miroir hors ligne", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({
      tasks: [TODAY_TASK],
      projects: [],
      tags: [],
      cursor: 1,
      syncedAt: SYNCED_AT,
    });
    const repository = createCachedTaskRepository(
      remoteStub({
        findById: async () => {
          throw networkError();
        },
      }),
      store,
      () => TODAY,
    );

    await expect(repository.findById(TODAY_TASK.id)).resolves.toEqual(TODAY_TASK);
  });

  it("met le miroir à jour après une complétion confirmée", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveTasks([TODAY_TASK]);
    const completed = buildTask(TODAY_TASK.id, { status: "DONE" });
    const repository = createCachedTaskRepository(
      remoteStub({ setStatus: async () => completed }),
      store,
      () => TODAY,
    );

    const result = await repository.setStatus(TODAY_TASK, "DONE");

    expect(result).toEqual(completed);
    expect(await store.findTask(TODAY_TASK.id)).toMatchObject({ status: "DONE" });
  });

  it("retire du miroir une tâche supprimée côté serveur", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveTasks([TODAY_TASK]);
    const repository = createCachedTaskRepository(
      remoteStub({ remove: async () => undefined }),
      store,
      () => TODAY,
    );

    await repository.remove(TODAY_TASK);

    expect(await store.findTask(TODAY_TASK.id)).toBeNull();
  });

  it("ne masque pas une erreur serveur derrière le miroir", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({
      tasks: [TODAY_TASK],
      projects: [],
      tags: [],
      cursor: 1,
      syncedAt: SYNCED_AT,
    });
    const conflict = new AppError({ code: "CONFLICT_VERSION", status: 409 });
    const repository = createCachedTaskRepository(
      remoteStub({
        list: async () => {
          throw conflict;
        },
      }),
      store,
      () => TODAY,
    );

    await expect(repository.list(taskListQuerySchema.parse({}))).rejects.toBe(conflict);
  });

  it("n'écrit jamais dans le miroir depuis une lecture en échec", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({
      tasks: [TODAY_TASK],
      projects: [],
      tags: [],
      cursor: 1,
      syncedAt: SYNCED_AT,
    });
    const read = vi.fn(async () => {
      throw networkError();
    });
    const repository = createCachedTaskRepository(remoteStub({ list: read }), store, () => TODAY);

    await repository.list(taskListQuerySchema.parse({}));

    expect(read).toHaveBeenCalledTimes(1);
    expect(await store.readStatus()).toMatchObject({ taskCount: 1, lastSyncAt: SYNCED_AT });
  });
});
