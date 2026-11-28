import { taskSchema, type Task } from "@focus/contracts";
import { describe, expect, it } from "vitest";
import {
  planLocalReminders,
  shiftOutOfQuietHours,
  type PlannedLocalReminder,
} from "./reminder-planning";

const TIMEZONE = "Europe/Paris";
const NOW = new Date("2026-11-28T10:00:00.000Z");

function buildTask(overrides: Partial<Task> = {}): Task {
  return taskSchema.parse({
    id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e61",
    title: "Appeler le comptable",
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

function triggers(plans: readonly PlannedLocalReminder[]): readonly string[] {
  return plans.map((plan) => plan.triggerAt);
}

describe("planLocalReminders", () => {
  it("combine rappel absolu et décalages relatifs sans doublon", () => {
    const task = buildTask({
      dueDate: "2026-11-30",
      dueTime: "09:00",
      reminderOffsets: [0, 15, 1_440],
      reminders: ["2026-11-30T08:00:00.000Z"],
    });

    const plans = planLocalReminders(task, {
      timezone: TIMEZONE,
      quietHours: null,
      now: NOW,
    });

    expect(triggers(plans)).toEqual([
      "2026-11-29T08:00:00.000Z",
      "2026-11-30T07:45:00.000Z",
      "2026-11-30T08:00:00.000Z",
    ]);
    // Le rappel absolu gagne le dédoublonnage : le décalage 0 n'est pas ajouté.
    expect(plans.map((plan) => plan.offsetMinutes)).toEqual([1_440, 15, null]);
  });

  it("reporte un rappel de 23 h à 8 h avec la mention « reporté »", () => {
    const task = buildTask({ reminders: ["2026-11-30T22:00:00.000Z"] });

    const plans = planLocalReminders(task, {
      timezone: TIMEZONE,
      quietHours: { start: "22:00", end: "08:00" },
      now: NOW,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      triggerAt: "2026-11-30T22:00:00.000Z",
      scheduledFor: "2026-12-01T07:00:00.000Z",
      postponed: true,
    });
  });

  it("laisse un rappel hors plage silencieuse inchangé", () => {
    const task = buildTask({ reminders: ["2026-11-30T08:00:00.000Z"] });

    const plans = planLocalReminders(task, {
      timezone: TIMEZONE,
      quietHours: { start: "22:00", end: "08:00" },
      now: NOW,
    });

    expect(plans[0]).toMatchObject({
      scheduledFor: "2026-11-30T08:00:00.000Z",
      postponed: false,
    });
  });

  it("respecte le plafond de cinq rappels et ignore les instants déjà échus", () => {
    const task = buildTask({
      dueDate: "2026-12-02",
      dueTime: "09:00",
      reminderOffsets: [0, 5, 15, 30, 60],
      reminders: ["2026-11-27T08:00:00.000Z"],
    });

    const plans = planLocalReminders(task, {
      timezone: TIMEZONE,
      quietHours: null,
      now: NOW,
    });

    expect(plans).toHaveLength(5);
    expect(plans.every((plan) => new Date(plan.scheduledFor) > NOW)).toBe(true);
  });

  it("ne planifie rien sans échéance ni rappel absolu", () => {
    const task = buildTask({ reminderOffsets: [15] });

    expect(
      planLocalReminders(task, { timezone: TIMEZONE, quietHours: null, now: NOW }),
    ).toEqual([]);
  });
});

describe("shiftOutOfQuietHours", () => {
  it("traverse minuit sans décaler un rappel du matin", () => {
    const instant = new Date("2026-11-30T08:30:00.000Z"); // 09:30 à Paris

    expect(
      shiftOutOfQuietHours(instant, { start: "22:00", end: "08:00" }, TIMEZONE),
    ).toEqual({ scheduledFor: instant, postponed: false });
  });

  it("décale un rappel du soir au lendemain matin", () => {
    const instant = new Date("2026-11-30T22:30:00.000Z"); // 23:30 à Paris

    expect(
      shiftOutOfQuietHours(instant, { start: "22:00", end: "08:00" }, TIMEZONE),
    ).toEqual({
      scheduledFor: new Date("2026-12-01T07:00:00.000Z"),
      postponed: true,
    });
  });
});
