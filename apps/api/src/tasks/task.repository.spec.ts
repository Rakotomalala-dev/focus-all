import type { Task } from "@focus/contracts";
import { describe, expect, it } from "vitest";
import { InMemoryTaskRepository, isAfterCursor, type TaskCursor } from "./task.repository";

const WORKSPACE = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f";
const TIMESTAMP = "2026-11-24T10:00:00.000Z";

const ID_A = "00000000-0000-7000-8000-00000000000a";
const ID_B = "00000000-0000-7000-8000-00000000000b";
const ID_C = "00000000-0000-7000-8000-00000000000c";
const ID_D = "00000000-0000-7000-8000-00000000000d";

function task(id: string, sortOrder: string): Task {
  return {
    id,
    workspaceId: WORKSPACE,
    title: `tâche ${id.slice(-1)}`,
    priority: "NONE",
    status: "TODO",
    sortOrder,
    version: 0,
    completedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    tagIds: [],
  };
}

const THREE_TASKS: readonly Task[] = [
  task(ID_A, "000001"),
  task(ID_B, "000002"),
  task(ID_C, "000003"),
];

describe("isAfterCursor", () => {
  const cursor: TaskCursor = { sortOrder: "000002", id: ID_B };

  it("compare d'abord sortOrder", () => {
    expect(isAfterCursor(task(ID_C, "000003"), cursor)).toBe(true);
    expect(isAfterCursor(task(ID_A, "000001"), cursor)).toBe(false);
  });

  it("traite la tâche du curseur comme déjà vue", () => {
    expect(isAfterCursor(task(ID_B, "000002"), cursor)).toBe(false);
  });

  it("départage deux clés de tri égales par l'id", () => {
    expect(isAfterCursor(task(ID_C, "000002"), cursor)).toBe(true);
    expect(isAfterCursor(task(ID_A, "000002"), cursor)).toBe(false);
  });
});

describe("InMemoryTaskRepository.list (keyset)", () => {
  it("renvoie la page qui suit la clé du curseur", async () => {
    const repository = InMemoryTaskRepository.withTasks(THREE_TASKS);

    const page = await repository.list({}, WORKSPACE, {
      limit: 1,
      after: { sortOrder: "000001", id: ID_A },
    });

    expect(page.items.map((item) => item.id)).toEqual([ID_B]);
    expect(page.hasMore).toBe(true);
  });

  it("ne saute ni ne répète aucune tâche si une tâche s'insère avant le curseur", async () => {
    const before = InMemoryTaskRepository.withTasks(THREE_TASKS);
    const first = await before.list({}, WORKSPACE, { limit: 2 });
    const lastSeen = first.items.at(-1);

    expect(first.items.map((item) => item.id)).toEqual([ID_A, ID_B]);
    expect(lastSeen).toBeDefined();

    const cursor: TaskCursor = {
      sortOrder: lastSeen?.sortOrder ?? "",
      id: lastSeen?.id ?? "",
    };

    // Une tâche apparaît entre les deux pages et se place en tête de liste.
    // Avec un curseur d'offset, la page 2 aurait répété ID_B et sauté ID_C.
    const afterInsert = InMemoryTaskRepository.withTasks([task(ID_D, "000000"), ...THREE_TASKS]);
    const second = await afterInsert.list({}, WORKSPACE, { limit: 2, after: cursor });

    expect(second.items.map((item) => item.id)).toEqual([ID_C]);
  });

  it("signale hasMore sans compter la collection entière", async () => {
    const repository = InMemoryTaskRepository.withTasks(THREE_TASKS);

    const all = await repository.list({}, WORKSPACE, { limit: 3 });
    const partial = await repository.list({}, WORKSPACE, { limit: 2 });

    expect(all.items).toHaveLength(3);
    expect(all.hasMore).toBe(false);
    expect(partial.hasMore).toBe(true);
  });
});
