import { describe, expect, it } from "vitest";
import type { AuthContext } from "../auth/auth-context";
import { DomainError } from "../../common/domain-error";
import { InMemoryTaskRepository, type StoredTask } from "./task.repository";
import type { ProjectRepository } from "../projects/project.repository";
import { InMemoryReminderRepository } from "../reminders/reminder.repository";
import { RemindersService } from "../reminders/reminders.service";
import type { TagRepository } from "../tags/tag.repository";
import { TasksService } from "./tasks.service";

// Tests de sécurité négatifs exigés par AGENTS §8 : une ressource d'un autre
// workspace doit être indistinguable d'une ressource absente (N-3), y compris
// face à une version obsolète — le 404 doit primer sur le 409, sinon le statut
// révèle l'existence de la tâche. Le workspace vient du contexte de session,
// jamais du corps ou de la query.
const AUTH: AuthContext = {
  userId: "018f3b3c-1a2b-7c3d-8e4f-444444444444",
  workspaceId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
};
const OTHER_WORKSPACE_ID = "018f3b3c-1a2b-7c3d-8e4f-111111111111";
const OTHER_AUTH: AuthContext = {
  userId: "018f3b3c-1a2b-7c3d-8e4f-555555555555",
  workspaceId: OTHER_WORKSPACE_ID,
};
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
    pinned: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    tagIds: [],
    reminders: [],
    reminderOffsets: [],
    recurrenceMode: "FIXED",
  };
}

function setup(): { service: TasksService; repository: InMemoryTaskRepository } {
  const repository = InMemoryTaskRepository.withTasks([
    storedTask(OWN_TASK_ID, AUTH.workspaceId, "000001"),
    storedTask(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID, "000002"),
  ]);
  return {
    service: new TasksService(
      repository,
      {} as TagRepository,
      {} as ProjectRepository,
      new RemindersService(new InMemoryReminderRepository(), {
        send: async () => undefined,
      }),
    ),
    repository,
  };
}

describe("cloisonnement par workspace — repository", () => {
  it("ne rend pas une tâche d'un autre workspace", async () => {
    const { repository } = setup();

    await expect(repository.findById(FOREIGN_TASK_ID, AUTH.workspaceId)).resolves.toBeUndefined();
    await expect(repository.findById(OWN_TASK_ID, AUTH.workspaceId)).resolves.toBeDefined();
  });

  it("filtre la liste sur le workspace courant uniquement", async () => {
    const { repository } = setup();

    const page = await repository.list({}, AUTH.workspaceId, { limit: 10 }, "MANUAL");

    expect(page.items.map((task) => task.id)).toEqual([OWN_TASK_ID]);
  });

  it("refuse une mutation d'une tâche d'un autre workspace sans rien changer", async () => {
    const { repository } = setup();

    const patched = await repository.update(
      FOREIGN_TASK_ID,
      AUTH.workspaceId,
      { title: "intrusion" },
      0,
    );
    const deleted = await repository.remove(FOREIGN_TASK_ID, AUTH.workspaceId, 0);
    const untouched = await repository.findById(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID);

    expect(patched).toEqual({ status: "not_found" });
    expect(deleted).toEqual({ status: "not_found" });
    expect(untouched?.title).toBe("tâche 3");
    expect(untouched?.version).toBe(0);
  });

  it("ne rend jamais le workspace dans une entité publique (N-7)", async () => {
    const { repository } = setup();

    const task = await repository.findById(OWN_TASK_ID, AUTH.workspaceId);

    expect(task).not.toHaveProperty("workspaceId");
    expect(Object.keys(task ?? {})).not.toContain("workspaceId");
  });
});

describe("cloisonnement par workspace — service (404, jamais 403)", () => {
  it("renvoie 404 en lecture", async () => {
    const { service } = setup();

    await expect(service.findById(AUTH, FOREIGN_TASK_ID)).rejects.toMatchObject({
      messageKey: "task.not_found",
      status: 404,
    });
  });

  it("renvoie 404 en modification, même avec une version obsolète", async () => {
    const { service, repository } = setup();

    await expect(
      service.update(AUTH, FOREIGN_TASK_ID, { title: "intrusion", version: 0 }, undefined),
    ).rejects.toBeInstanceOf(DomainError);
    // Version obsolète comprise : le 404 doit primer, sinon 409 révélerait
    // l'existence et même la version de la tâche.
    await expect(
      service.update(AUTH, FOREIGN_TASK_ID, { title: "intrusion", version: 42 }, undefined),
    ).rejects.toMatchObject({ messageKey: "task.not_found", status: 404 });

    await expect(repository.findById(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID)).resolves.toMatchObject({
      title: "tâche 3",
      version: 0,
    });
  });

  it("renvoie 404 en suppression", async () => {
    const { service, repository } = setup();

    await expect(
      service.remove(AUTH, FOREIGN_TASK_ID, { version: 0 }, undefined),
    ).rejects.toMatchObject({ messageKey: "task.not_found" });
    await expect(repository.findById(FOREIGN_TASK_ID, OTHER_WORKSPACE_ID)).resolves.toBeDefined();
  });

  it("n'expose pas les tâches d'un autre workspace dans la liste", async () => {
    const { service } = setup();

    const page = await service.list(AUTH, {});

    expect(page.items.map((task) => task.id)).toEqual([OWN_TASK_ID]);
  });

  it("isole aussi la création : chaque contexte ne voit que ses tâches", async () => {
    const { service } = setup();

    const created = await service.create(AUTH, { title: "nouvelle" });

    await expect(service.list(AUTH, {})).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    });
    const otherPage = await service.list(OTHER_AUTH, {});
    expect(otherPage.items.map((task) => task.id)).toEqual([FOREIGN_TASK_ID]);
  });
});
