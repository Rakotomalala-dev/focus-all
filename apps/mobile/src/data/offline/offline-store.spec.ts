import {
  projectSchema,
  tagSchema,
  taskSchema,
  type Project,
  type Tag,
  type Task,
} from "@focus/contracts";
import { describe, expect, it } from "vitest";
import { createOfflineStore } from "./offline-store";
import { createMemoryStoragePort } from "./storage-port";

const SYNCED_AT = "2026-11-28T10:00:00.000Z";

function buildTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return taskSchema.parse({
    id,
    title,
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

function buildProject(): Project {
  return projectSchema.parse({
    id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e70",
    name: "Maison",
    color: null,
    description: null,
    sortOrder: "a0",
    archivedAt: null,
    version: 1,
    createdAt: "2026-11-25T09:00:00Z",
    updatedAt: "2026-11-25T09:00:00Z",
  });
}

function buildTag(): Tag {
  return tagSchema.parse({
    id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e80",
    name: "urgent",
    color: null,
    createdAt: "2026-11-25T09:00:00Z",
    updatedAt: "2026-11-25T09:00:00Z",
  });
}

const TASK_A = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e51", "Acheter du pain");
const TASK_B = buildTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e52", "Appeler le comptable");

describe("offlineStore", () => {
  it("enregistre un instantané complet et expose son état", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.initialize();

    await store.saveSnapshot({
      tasks: [TASK_A, TASK_B],
      projects: [buildProject()],
      tags: [buildTag()],
      cursor: 42,
      syncedAt: SYNCED_AT,
    });

    expect(await store.readStatus()).toEqual({
      cursor: 42,
      lastSyncAt: SYNCED_AT,
      taskCount: 2,
      projectCount: 1,
      tagCount: 1,
      corruptedCount: 0,
    });
    expect((await store.readTasks()).map((task) => task.id)).toEqual([
      TASK_A.id,
      TASK_B.id,
    ]);
    expect(await store.findTask(TASK_A.id)).toMatchObject({ title: "Acheter du pain" });
    expect(await store.findTask("018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e99")).toBeNull();
    expect(await store.readProjects()).toHaveLength(1);
    expect(await store.readTags()).toHaveLength(1);
  });

  it("remplace la collection sur un nouvel instantané", async () => {
    const store = createOfflineStore(createMemoryStoragePort());

    await store.saveSnapshot({
      tasks: [TASK_A, TASK_B],
      projects: [],
      tags: [],
      cursor: 1,
      syncedAt: SYNCED_AT,
    });
    await store.saveSnapshot({
      tasks: [TASK_B],
      projects: [],
      tags: [],
      cursor: 2,
      syncedAt: SYNCED_AT,
    });

    const status = await store.readStatus();
    expect(status.taskCount).toBe(1);
    expect(status.cursor).toBe(2);
    expect(await store.findTask(TASK_A.id)).toBeNull();
  });

  it("met à jour une tâche sans doublon et supprime sur demande", async () => {
    const store = createOfflineStore(createMemoryStoragePort());
    await store.saveTasks([TASK_A]);

    await store.saveTasks([{ ...TASK_A, title: "Acheter du pain complet" }]);
    expect(await store.readTasks()).toHaveLength(1);
    expect((await store.findTask(TASK_A.id))?.title).toBe("Acheter du pain complet");

    await store.removeTasks([TASK_A.id]);
    expect(await store.readStatus()).toMatchObject({ taskCount: 0 });
  });

  it("ignore une entrée corrompue et la compte pour guider la réinitialisation", async () => {
    const port = createMemoryStoragePort();
    const store = createOfflineStore(port);

    await store.saveSnapshot({
      tasks: [TASK_A],
      projects: [],
      tags: [],
      cursor: 3,
      syncedAt: SYNCED_AT,
    });
    await port.upsertEntities("tasks", [
      { id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e53", payload: "{not-json" },
    ]);

    const status = await store.readStatus();
    expect(status.corruptedCount).toBe(1);
    expect(status.taskCount).toBe(1);
    expect(await store.readTasks()).toHaveLength(1);
  });

  it("vide le miroir et le curseur mais conserve l'identifiant d'appareil", async () => {
    const port = createMemoryStoragePort();
    const store = createOfflineStore(port);

    await store.saveSnapshot({
      tasks: [TASK_A],
      projects: [buildProject()],
      tags: [buildTag()],
      cursor: 9,
      syncedAt: SYNCED_AT,
    });
    await port.writeMeta("deviceId", "device-1");

    await store.reset();

    expect(await store.readStatus()).toEqual({
      cursor: 0,
      lastSyncAt: null,
      taskCount: 0,
      projectCount: 0,
      tagCount: 0,
      corruptedCount: 0,
    });
    expect(await port.readMeta("deviceId")).toBe("device-1");
  });
});
