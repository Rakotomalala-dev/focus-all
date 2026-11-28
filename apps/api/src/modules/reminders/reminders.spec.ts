import { taskSchema, type Task } from "@focus/contracts";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "../auth/auth-context";
import type { PushMessage, PushSender } from "./expo-push.sender";
import { InMemoryReminderRepository } from "./reminder.repository";
import { shiftOutOfQuietHours } from "./reminder-time";
import { planReminders, RemindersService } from "./reminders.service";

// RF-50/RF-51 : planification, report hors plage silencieuse, livraison
// idempotente et préférences par catégorie/appareil, sans PostgreSQL.
const TIMEZONE = "Europe/Paris";

const AUTH: AuthContext = {
  userId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e81",
  workspaceId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e82",
};

function buildTask(overrides: Partial<Task> = {}): Task {
  return taskSchema.parse({
    id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e83",
    title: "Appeler le comptable",
    status: "TODO",
    completedAt: null,
    pinned: false,
    sortOrder: "a0",
    version: 1,
    createdAt: "2026-11-28T09:00:00Z",
    updatedAt: "2026-11-28T09:00:00Z",
    ...overrides,
  });
}

class FakePushSender implements PushSender {
  readonly batches: PushMessage[][] = [];

  async send(messages: readonly PushMessage[]): Promise<void> {
    this.batches.push([...messages]);
  }
}

function setup() {
  const repository = InMemoryReminderRepository.create({
    timezone: TIMEZONE,
    locale: "fr",
  });
  const push = new FakePushSender();
  const service = new RemindersService(repository, push);
  return { repository, push, service };
}

describe("planReminders", () => {
  it("dédoublonne un rappel absolu et un décalage relatif identiques", () => {
    const task = buildTask({
      dueDate: "2026-11-30",
      dueTime: "09:00",
      reminderOffsets: [0, 15, 1_440],
      reminders: ["2026-11-30T08:00:00.000Z"],
    });

    const plans = planReminders(task, TIMEZONE, null);

    expect(plans.map((plan) => plan.triggerAt.toISOString())).toEqual([
      "2026-11-29T08:00:00.000Z",
      "2026-11-30T07:45:00.000Z",
      "2026-11-30T08:00:00.000Z",
    ]);
    expect(plans.map((plan) => plan.offsetMinutes)).toEqual([1_440, 15, null]);
  });

  it("reporte un rappel de 23 h à 8 h avec postponed", () => {
    const task = buildTask({ reminders: ["2026-11-30T22:00:00.000Z"] });

    const plans = planReminders(
      task,
      TIMEZONE,
      { start: "22:00", end: "08:00" },
    );

    expect(plans).toHaveLength(1);
    expect(plans[0]?.scheduledFor.toISOString()).toBe("2026-12-01T07:00:00.000Z");
    expect(plans[0]?.postponed).toBe(true);
  });
});

describe("shiftOutOfQuietHours", () => {
  it("ne décale pas un rappel hors plage", () => {
    const instant = new Date("2026-11-30T09:00:00.000Z");

    expect(shiftOutOfQuietHours(instant, { start: "22:00", end: "08:00" }, TIMEZONE)).toEqual({
      scheduledFor: instant,
      postponed: false,
    });
  });
});

describe("RemindersService", () => {
  it("planifie puis livre un rappel une seule fois", async () => {
    const { repository, push, service } = setup();
    const task = buildTask({ reminders: ["2026-11-28T10:05:00.000Z"] });
    await service.registerDevice(AUTH, {
      platform: "ANDROID",
      pushToken: "ExponentPushToken[abc]",
    });

    await service.scheduleTask(task, { userId: AUTH.userId, workspaceId: AUTH.workspaceId });
    const pending = await repository.pendingDeliveries(task.id);
    expect(pending).toHaveLength(1);

    const scheduledFor = pending[0]?.scheduledFor;
    expect(scheduledFor).toBeDefined();
    if (scheduledFor === undefined) return;

    expect(await service.dispatchDue(new Date(scheduledFor))).toBe(1);
    expect(await service.dispatchDue(new Date("2026-11-28T11:00:00.000Z"))).toBe(0);
    expect(push.batches).toHaveLength(1);
    expect(push.batches[0]?.[0]).toMatchObject({
      to: "ExponentPushToken[abc]",
      data: { taskId: task.id },
    });
  });

  it("n'envoie rien quand la catégorie rappels est désactivée", async () => {
    const { repository, push, service } = setup();
    await service.registerDevice(AUTH, {
      platform: "ANDROID",
      pushToken: "ExponentPushToken[abc]",
    });
    await service.updatePreferences(AUTH, { remindersEnabled: false });

    const task = buildTask({ reminders: ["2026-11-28T10:05:00.000Z"] });
    await service.scheduleTask(task, { userId: AUTH.userId, workspaceId: AUTH.workspaceId });
    const pending = await repository.pendingDeliveries(task.id);
    const scheduledFor = pending[0]?.scheduledFor;
    expect(scheduledFor).toBeDefined();
    if (scheduledFor === undefined) return;

    expect(await service.dispatchDue(new Date(scheduledFor))).toBe(0);
    expect(push.batches).toHaveLength(0);
  });

  it("ignore un appareil dont les notifications sont désactivées", async () => {
    const { repository, push, service } = setup();
    const device = await service.registerDevice(AUTH, {
      platform: "ANDROID",
      pushToken: "ExponentPushToken[abc]",
    });
    await service.updateDevice(AUTH, device.id, { notificationsEnabled: false });

    const task = buildTask({ reminders: ["2026-11-28T10:05:00.000Z"] });
    await service.scheduleTask(task, { userId: AUTH.userId, workspaceId: AUTH.workspaceId });
    const pending = await repository.pendingDeliveries(task.id);
    const scheduledFor = pending[0]?.scheduledFor;
    expect(scheduledFor).toBeDefined();
    if (scheduledFor === undefined) return;

    expect(await service.dispatchDue(new Date(scheduledFor))).toBe(0);
    expect(push.batches).toHaveLength(0);
  });

  it("ajoute la mention « Rappel reporté » au push décalé", async () => {
    const { repository, push, service } = setup();
    await service.registerDevice(AUTH, {
      platform: "ANDROID",
      pushToken: "ExponentPushToken[abc]",
    });
    await service.updatePreferences(AUTH, {
      quietHours: { start: "22:00", end: "08:00" },
    });

    const task = buildTask({ reminders: ["2026-11-28T22:00:00.000Z"] });
    await service.scheduleTask(task, { userId: AUTH.userId, workspaceId: AUTH.workspaceId });
    const pending = await repository.pendingDeliveries(task.id);
    expect(pending[0]?.postponed).toBe(true);
    expect(pending[0]?.scheduledFor).toBe("2026-11-29T07:00:00.000Z");

    const scheduledFor = pending[0]?.scheduledFor;
    if (scheduledFor === undefined) return;
    await service.dispatchDue(new Date(scheduledFor));

    expect(push.batches[0]?.[0]?.title).toContain("Rappel reporté");
  });

  it("applique les préférences et l'état de l'appareil par utilisateur", async () => {
    const { service } = setup();

    await service.updatePreferences(AUTH, {
      dailySummaryEnabled: true,
      quietHours: { start: "21:00", end: "07:00" },
    });
    const preferences = await service.getPreferences(AUTH);
    expect(preferences).toMatchObject({
      dailySummaryEnabled: true,
      quietHours: { start: "21:00", end: "07:00" },
    });

    const device = await service.registerDevice(AUTH, {
      platform: "ANDROID",
      pushToken: "ExponentPushToken[xyz]",
    });
    await service.updateDevice(AUTH, device.id, { notificationsEnabled: false });
    const devices = await service.listDevices(AUTH);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.notificationsEnabled).toBe(false);

    await service.removeDevice(AUTH, device.id);
    expect(await service.listDevices(AUTH)).toHaveLength(0);
  });
});
