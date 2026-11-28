import { syncPullResponseSchema, taskSchema, type Task } from "@focus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createOfflineStore } from "./offline-store";
import { createMemoryStoragePort } from "./storage-port";
import { pullRemoteChanges } from "./sync-watcher";

const NOW = "2026-11-28T10:00:00.000Z";
const TASK_A_ID = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e51";
const TASK_B_ID = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e52";

function task(id: string, title: string): Task {
  return taskSchema.parse({
    id,
    title,
    status: "TODO",
    completedAt: null,
    pinned: false,
    sortOrder: "a0",
    version: 1,
    createdAt: "2026-11-25T09:00:00.000Z",
    updatedAt: "2026-11-25T09:00:00.000Z",
  });
}

function change(
  cursor: number,
  entityId: string,
  operation: "UPSERT" | "DELETE",
  payload: unknown,
) {
  return {
    cursor,
    entityType: "task" as const,
    entityId,
    operation,
    version: cursor,
    payload,
    actorId: null,
    changedAt: NOW,
  };
}

describe("pullRemoteChanges (RF-60)", () => {
  it("applique un UPSERT et avance le curseur sans action manuelle", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({ tasks: [], projects: [], tags: [], cursor: 4, syncedAt: NOW });
    const pull = vi.fn(async (since: number) => {
      expect(since).toBe(4);
      return syncPullResponseSchema.parse({
        changes: [change(5, TASK_A_ID, "UPSERT", task(TASK_A_ID, "Depuis A"))],
        nextCursor: 5,
        hasMore: false,
      });
    });

    const outcome = await pullRemoteChanges({
      store,
      sync: { pull },
      now: () => new Date(NOW),
    });

    expect(outcome).toMatchObject({ applied: 1, cursor: 5, changed: true, syncedAt: NOW });
    expect((await store.readTasks()).map((item) => item.title)).toEqual(["Depuis A"]);
    expect(await store.readStatus()).toMatchObject({ cursor: 5, lastSyncAt: NOW });
  });

  it("applique une suppression et enchaîne les pages tant que hasMore", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({
      tasks: [task(TASK_A_ID, "A")],
      projects: [],
      tags: [],
      cursor: 10,
      syncedAt: NOW,
    });
    const pages = [
      syncPullResponseSchema.parse({
        changes: [change(11, TASK_A_ID, "DELETE", { id: TASK_A_ID })],
        nextCursor: 11,
        hasMore: true,
      }),
      syncPullResponseSchema.parse({
        changes: [change(12, TASK_B_ID, "UPSERT", task(TASK_B_ID, "B"))],
        nextCursor: 12,
        hasMore: false,
      }),
    ];
    let index = 0;
    const pull = vi.fn(async (_since: number) => {
      const page = pages[index];
      index += 1;
      if (page === undefined) throw new Error("page inattendue");
      return page;
    });

    const outcome = await pullRemoteChanges({
      store,
      sync: { pull },
      now: () => new Date(NOW),
    });

    expect(pull).toHaveBeenCalledTimes(2);
    expect(pull.mock.calls.map(([since]) => since)).toEqual([10, 11]);
    expect(outcome).toMatchObject({ applied: 2, cursor: 12, changed: true });
    expect((await store.readTasks()).map((item) => item.id)).toEqual([TASK_B_ID]);
  });

  it("ignore un payload illisible mais avance le curseur pour ne pas boucler", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({ tasks: [], projects: [], tags: [], cursor: 0, syncedAt: NOW });
    const pull = vi.fn(async () =>
      syncPullResponseSchema.parse({
        changes: [change(1, TASK_A_ID, "UPSERT", { id: "pas-une-tache" })],
        nextCursor: 1,
        hasMore: false,
      }),
    );

    const outcome = await pullRemoteChanges({
      store,
      sync: { pull },
      now: () => new Date(NOW),
    });

    expect(outcome).toMatchObject({ applied: 0, cursor: 1, changed: true });
    expect(await store.readTasks()).toEqual([]);
    expect((await store.readStatus()).cursor).toBe(1);
  });

  it("ne touche à rien quand le journal est déjà à jour", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveSnapshot({ tasks: [], projects: [], tags: [], cursor: 7, syncedAt: NOW });
    const pull = vi.fn(async () =>
      syncPullResponseSchema.parse({ changes: [], nextCursor: 7, hasMore: false }),
    );

    const outcome = await pullRemoteChanges({
      store,
      sync: { pull },
      now: () => new Date(NOW),
    });

    expect(outcome).toMatchObject({ applied: 0, cursor: 7, changed: false });
  });
});
