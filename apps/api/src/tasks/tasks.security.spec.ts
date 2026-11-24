import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DEV_WORKSPACE_ID } from "./dev-workspace";
import { InMemoryTaskRepository, type StoredTask } from "./task.repository";
import { TasksService } from "./tasks.service";

// Tests de sécurité négatifs exigés par AGENTS §8 : une ressource d'un autre
// workspace doit être indistinguable d'une ressource absente (N-3), y compris
// face à une version obsolète — le 404 doit primer sur le 409, sinon le statut
// révèle l'existence de la tâche.
const OTHER_WORKSPACE_ID = "018f3b3c-1a2b-7c3d-8e4f-111111111111";
const OWN_TASK_ID = "018f3b3c-1a2b-7c3d-8e4f-222222222222";
const FOREIGN_TASK_ID = "018f3b3c-1a2b-7c3d-8e4f-333333333333";
const TIMESTAMP = "2026-11-24T10:00:00.000Z";

function storedTask(id: string, workspaceId: string, sortOrder: string): StoredTask {
  return {
    id,
    workspaceId,
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

function setup(): { service: TasksService; repository: InMemoryTaskRepository } {
  const repository = InMemoryTaskRepository.withTasks([
    storedTask(OWN_TASK_ID, DEV_WORKSPACE_ID, "000001"),
    storedTask(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID, "000002"),
  ]);
  return { service: new TasksService(repository), repository };
}

describe("cloisonnement par workspace — repository", () => {
  it("ne rend pas une tâche d'un autre workspace", async () => {
    const { repository } = setup();

    await expect(repository.findById(FOREIGN_TASK_ID, DEV_WORKSPACE_ID)).resolves.toBeUndefined();
    await expect(repository.findById(OWN_TASK_ID, DEV_WORKSPACE_ID)).resolves.toBeDefined();
  });

  it("filtre la liste sur le workspace courant uniquement", async () => {
    const { repository } = setup();

    const page = await repository.list({}, DEV_WORKSPACE_ID, { limit: 10 });

    expect(page.items.map((task) => task.id)).toEqual([OWN_TASK_ID]);
  });

  it("refuse une mutation d'une tâche d'un autre workspace sans rien changer", async () => {
    const { repository } = setup();

    const patched = await repository.update(
      FOREIGN_TASK_ID,
      DEV_WORKSPACE_ID,
      { title: "intrusion" },
      0,
    );
    const deleted = await repository.remove(FOREIGN_TASK_ID, DEV_WORKSPACE_ID, 0);
    const untouched = await repository.findById(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID);

    expect(patched).toEqual({ status: "not_found" });
    expect(deleted).toEqual({ status: "not_found" });
    expect(untouched?.title).toBe("tâche 3");
    expect(untouched?.version).toBe(0);
  });

  it("ne rend jamais le workspace dans une entité publique (N-7)", async () => {
    const { repository } = setup();

    const task = await repository.findById(OWN_TASK_ID, DEV_WORKSPACE_ID);

    expect(task).not.toHaveProperty("workspaceId");
    expect(Object.keys(task ?? {})).not.toContain("workspaceId");
  });
});

describe("cloisonnement par workspace — service (404, jamais 403)", () => {
  it("renvoie 404 en lecture", async () => {
    const { service } = setup();

    await expect(service.findById(FOREIGN_TASK_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("renvoie 404 en modification, même avec une version obsolète", async () => {
    const { service, repository } = setup();

    await expect(
      service.update(FOREIGN_TASK_ID, { title: "intrusion", version: 0 }, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Version obsolète comprise : le 404 doit primer, sinon 409 révélerait
    // l'existence et même la version de la tâche.
    await expect(
      service.update(FOREIGN_TASK_ID, { title: "intrusion", version: 42 }, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(repository.findById(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID)).resolves.toMatchObject({
      title: "tâche 3",
      version: 0,
    });
  });

  it("renvoie 404 en suppression", async () => {
    const { service, repository } = setup();

    await expect(service.remove(FOREIGN_TASK_ID, { version: 0 }, undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(repository.findById(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID)).resolves.toBeDefined();
  });

  it("n'expose pas les tâches d'un autre workspace dans la liste", async () => {
    const { service } = setup();

    const page = await service.list({});

    expect(page.items.map((task) => task.id)).toEqual([OWN_TASK_ID]);
  });
});
