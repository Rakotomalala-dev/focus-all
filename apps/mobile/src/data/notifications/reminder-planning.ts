import {
  MAX_TASK_REMINDERS,
  type QuietHours,
  type Task,
} from "@focus/contracts";

// RF-50 : planification locale Android. Le calcul reproduit celui du serveur
// (`apps/api/src/modules/reminders/reminder-time.ts`) : décalage relatif à
// l'échéance dans le fuseau de l'utilisateur, dédoublonnage par instant, puis
// report hors plage silencieuse. Aucune dépendance de date n'est ajoutée (O8).
export type PlannedLocalReminder = {
  readonly triggerAt: string;
  readonly scheduledFor: string;
  readonly offsetMinutes: number | null;
  readonly postponed: boolean;
};

type LocalParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};

function partOf(parts: readonly Intl.DateTimeFormatPart[], type: string): number {
  const found = parts.find((part) => part.type === type);
  return found === undefined ? 0 : Number(found.value);
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  return {
    year: partOf(parts, "year"),
    month: partOf(parts, "month"),
    day: partOf(parts, "day"),
    hour: partOf(parts, "hour"),
    minute: partOf(parts, "minute"),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const truncated = Math.floor(instant.getTime() / 60_000) * 60_000;
  return asUtc - truncated;
}

export function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
  const [year = "1970", month = "1", day = "1"] = date.split("-");
  const naive = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Math.floor(minutes / 60),
    minutes % 60,
  );
  const first = naive - offsetMs(new Date(naive), timeZone);
  const second = naive - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

function addLocalDays(date: string, days: number): string {
  const [year = "1970", month = "1", day = "1"] = date.split("-");
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days));
  return shifted.toISOString().slice(0, 10);
}

function localDateString(instant: Date, timeZone: string): string {
  const parts = localParts(instant, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function isQuietHours(
  instant: Date,
  quiet: QuietHours,
  timeZone: string,
): boolean {
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  const local = localParts(instant, timeZone);
  const minutes = local.hour * 60 + local.minute;
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

// « Rappel reporté » : un rappel qui tombe dans la plage silencieuse est décalé
// à la fin de celle-ci (RF-50, critère d'acceptation 23 h → 8 h).
export function shiftOutOfQuietHours(
  instant: Date,
  quiet: QuietHours | null,
  timeZone: string,
): { readonly scheduledFor: Date; readonly postponed: boolean } {
  if (quiet === null || !isQuietHours(instant, quiet, timeZone)) {
    return { scheduledFor: instant, postponed: false };
  }

  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  const local = localParts(instant, timeZone);
  const minutes = local.hour * 60 + local.minute;
  const crossesMidnight = start > end;
  const sameDay = crossesMidnight ? minutes < end : true;
  const date = localDateString(instant, timeZone);
  const target = sameDay ? date : addLocalDays(date, 1);

  return { scheduledFor: zonedToUtc(target, end, timeZone), postponed: true };
}

export function dueInstant(
  dueDate: string,
  dueTime: string | undefined,
  timeZone: string,
): Date {
  return zonedToUtc(dueDate, toMinutes(dueTime ?? "09:00"), timeZone);
}

/**
 * Retourne les rappels futurs à planifier, triés, sans doublon et limités au
 * plafond de cinq par tâche. Les rappels déjà échus ne sont jamais replanifiés :
 * un rappel envoyé n'est pas répété.
 */
export function planLocalReminders(
  task: Pick<Task, "reminders" | "reminderOffsets" | "dueDate" | "dueTime">,
  options: {
    readonly timezone: string;
    readonly quietHours: QuietHours | null;
    readonly now: Date;
  },
): readonly PlannedLocalReminder[] {
  const instants = new Map<string, number | null>();

  for (const reminder of task.reminders) {
    instants.set(new Date(reminder).toISOString(), null);
  }

  if (task.dueDate !== undefined) {
    const due = dueInstant(task.dueDate, task.dueTime, options.timezone);
    for (const offset of task.reminderOffsets) {
      const triggerAt = new Date(due.getTime() - offset * 60_000);
      const key = triggerAt.toISOString();
      if (!instants.has(key)) {
        instants.set(key, offset);
      }
    }
  }

  return [...instants.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([iso, offsetMinutes]) => {
      const triggerAt = new Date(iso);
      const shifted = shiftOutOfQuietHours(triggerAt, options.quietHours, options.timezone);
      return {
        triggerAt: triggerAt.toISOString(),
        scheduledFor: shifted.scheduledFor.toISOString(),
        offsetMinutes,
        postponed: shifted.postponed,
      };
    })
    // Les rappels déjà échus ne comptent pas dans le plafond de cinq.
    .filter((plan) => new Date(plan.scheduledFor) > options.now)
    .slice(0, MAX_TASK_REMINDERS);
}
