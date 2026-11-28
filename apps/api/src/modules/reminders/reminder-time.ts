import type { QuietHours } from "@focus/contracts";

// RF-50 : un rappel relatif se calcule en heure locale de l'utilisateur, puis
// se stocke en UTC. Ces helpers n'utilisent que `Intl`, donc aucune dépendance
// de date supplémentaire n'est nécessaire (O8).

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Décalage du fuseau à un instant donné, en millisecondes (positif à l'est).
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

export function fromMinutes(total: number): string {
  const normalized = ((total % 1_440) + 1_440) % 1_440;
  return `${Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`;
}

// Date civile + heure locale → instant UTC. Le second passage couvre le cas
// d'une heure ambiguë ou sautée par un changement d'heure.
export function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
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

export function addLocalDays(date: string, days: number): string {
  const [year = "1970", month = "1", day = "1"] = date.split("-");
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days));
  return shifted.toISOString().slice(0, 10);
}

export function localDateString(instant: Date, timeZone: string): string {
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
  // Plage qui traverse minuit : 22 h → 8 h.
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

// Déplace un rappel hors de la plage silencieuse, à la fin de celle-ci (RF-50 :
// « reporté à l'ouverture de la plage, avec mention »).
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
  // Avant la fin le même jour, sauf si la plage traverse minuit et que l'on est
  // déjà le soir (le report tombe alors le lendemain matin).
  const sameDay = crossesMidnight ? minutes < end : true;
  const date = localDateString(instant, timeZone);
  const target = sameDay ? date : addLocalDays(date, 1);

  return { scheduledFor: zonedToUtc(target, end, timeZone), postponed: true };
}

// Échéance d'une tâche : date civile + heure (09:00 par défaut pour une tâche
// « journée entière », ce qui donne un rappel utilisable le matin).
export function dueInstant(
  dueDate: string,
  dueTime: string | undefined,
  timeZone: string,
): Date {
  return zonedToUtc(dueDate, toMinutes(dueTime ?? "09:00"), timeZone);
}

export function minutesToIso(triggerAt: Date): string {
  return triggerAt.toISOString();
}

export const TIME_DAY_MS = DAY_MS;
