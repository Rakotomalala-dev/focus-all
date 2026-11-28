import { taskSchema, type Task } from "@focus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createReminderSync, type ReminderScheduler } from "./reminder-sync";

const NOW = new Date("2026-11-28T10:00:00.000Z");

function buildTask(overrides: Partial<Task> = {}): Task {
  return taskSchema.parse({
    id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e62",
    title: "Préparer la réunion",
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

function setup(options: {
  remindersEnabled?: boolean;
  quietHours?: { start: string; end: string } | null;
  permission?: "granted" | "denied" | "undetermined";
}) {
  const scheduler: ReminderScheduler = {
    cancelAll: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
    schedule: vi.fn(async (input) => input.plans.length),
  };
  const api = {
    preferences: vi.fn(async () => ({
      remindersEnabled: options.remindersEnabled ?? true,
      dailySummaryEnabled: false,
      collaborationEnabled: true,
      quietHours: options.quietHours ?? null,
    })),
  };
  const push = { getPermission: vi.fn(async () => options.permission ?? ("granted" as const)) };
  const sync = createReminderSync({
    api,
    scheduler,
    push,
    timezone: () => "Europe/Paris",
    now: () => NOW,
    translate: (key) => key,
  });
  return { sync, scheduler, api, push };
}

describe("reminderSync", () => {
  it("planifie les rappels futurs avec le texte reporté", async () => {
    const { sync, scheduler } = setup({});
    const task = buildTask({
      dueDate: "2026-11-30",
      dueTime: "09:00",
      reminderOffsets: [0, 15],
    });

    const scheduled = await sync.syncTask(task);

    expect(scheduled).toBe(2);
    expect(scheduler.cancelTask).toHaveBeenCalledWith(task.id);
    expect(scheduler.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        title: task.title,
        body: "notifications.body",
        postponedBody: "notifications.postponed",
      }),
    );
  });

  it("annule les notifications d'une tâche terminée sans lire les préférences", async () => {
    const { sync, scheduler, api } = setup({});
    const task = buildTask({ status: "DONE", reminders: ["2026-11-30T08:00:00.000Z"] });

    expect(await sync.syncTask(task)).toBe(0);
    expect(scheduler.cancelTask).toHaveBeenCalledWith(task.id);
    expect(scheduler.schedule).not.toHaveBeenCalled();
    expect(api.preferences).not.toHaveBeenCalled();
  });

  it("annule tout quand la catégorie rappels est désactivée", async () => {
    const { sync, scheduler } = setup({ remindersEnabled: false });
    const task = buildTask({ reminders: ["2026-11-30T08:00:00.000Z"] });

    expect(await sync.syncTask(task)).toBe(0);
    expect(scheduler.cancelTask).toHaveBeenCalledWith(task.id);
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it("ne planifie rien sans permission système et retire les anciennes", async () => {
    const { sync, scheduler } = setup({ permission: "denied" });
    const task = buildTask({ reminders: ["2026-11-30T08:00:00.000Z"] });

    expect(await sync.syncTask(task)).toBe(0);
    expect(scheduler.cancelTask).toHaveBeenCalledWith(task.id);
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it("annule sans replanifier quand tous les rappels sont passés", async () => {
    const { sync, scheduler } = setup({});
    const task = buildTask({ reminders: ["2026-11-27T08:00:00.000Z"] });

    expect(await sync.syncTask(task)).toBe(0);
    expect(scheduler.cancelTask).toHaveBeenCalledWith(task.id);
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it("additionne les notifications planifiées sur plusieurs tâches", async () => {
    const { sync } = setup({});
    const tasks = [
      buildTask({ id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e63", reminders: ["2026-11-30T08:00:00.000Z"] }),
      buildTask({ id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e64", reminders: ["2026-12-01T08:00:00.000Z"] }),
    ];

    expect(await sync.syncAll(tasks)).toBe(2);
  });
});
