import type { RecurrenceMode } from "@focus/contracts";
import { DomainError } from "../../common/domain-error";

const WEEKDAYS: Readonly<Record<string, number>> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

// RF-28 : une série ne génère jamais plus de 500 occurrences à la demande.
export const MAX_RECURRENCE_OCCURRENCES = 500;

type Rule = {
  readonly freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  readonly interval: number;
  readonly byDay: readonly string[];
  readonly byMonthDay: number | null;
  readonly bySetPos: number | null;
};

function parseRule(value: string): Rule {
  if (!value.startsWith("RRULE:")) {
    throw new DomainError("task.recurrence_invalid");
  }
  const parts = new Map<string, string>();
  for (const part of value.slice("RRULE:".length).split(";")) {
    const [key, raw] = part.split("=");
    if (key === undefined || raw === undefined || key.length === 0 || raw.length === 0) {
      throw new DomainError("task.recurrence_invalid");
    }
    parts.set(key.toUpperCase(), raw.toUpperCase());
  }

  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    throw new DomainError("task.recurrence_invalid");
  }
  const interval = Number(parts.get("INTERVAL") ?? "1");
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new DomainError("task.recurrence_invalid");
  }

  const byDay = (parts.get("BYDAY") ?? "")
    .split(",")
    .filter((day) => day.length > 0)
    .map((day) => day.replace(/^[+-]?\d+/, ""));
  if (byDay.some((day) => WEEKDAYS[day] === undefined)) {
    throw new DomainError("task.recurrence_invalid");
  }

  const byMonthDayRaw = parts.get("BYMONTHDAY");
  const byMonthDay = byMonthDayRaw === undefined ? null : Number(byMonthDayRaw);
  if (byMonthDay !== null && (!Number.isInteger(byMonthDay) || byMonthDay < 1 || byMonthDay > 31)) {
    throw new DomainError("task.recurrence_invalid");
  }

  const setPosRaw = (parts.get("BYDAY") ?? "").match(/^([+-]?\d)/)?.[1];
  const bySetPos = setPosRaw === undefined ? null : Number(setPosRaw);
  if (bySetPos !== null && (bySetPos === 0 || Math.abs(bySetPos) > 5)) {
    throw new DomainError("task.recurrence_invalid");
  }

  return {
    freq,
    interval,
    byDay,
    byMonthDay,
    bySetPos,
  };
}

export function assertRecurrenceRule(value: string): void {
  parseRule(value);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function nextMonthly(date: Date, rule: Rule): Date {
  if (rule.bySetPos !== null && rule.byDay.length === 1) {
    const weekday = WEEKDAYS[rule.byDay[0] ?? "MO"] ?? 1;
    const start = addMonths(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)), rule.interval);
    const month = start.getUTCMonth();
    const year = start.getUTCFullYear();
    if (rule.bySetPos > 0) {
      const first = new Date(Date.UTC(year, month, 1));
      const delta = (weekday - first.getUTCDay() + 7) % 7;
      return new Date(Date.UTC(year, month, 1 + delta + (rule.bySetPos - 1) * 7));
    }
    const last = new Date(Date.UTC(year, month + 1, 0));
    const delta = (last.getUTCDay() - weekday + 7) % 7;
    return new Date(Date.UTC(year, month, last.getUTCDate() - delta + (rule.bySetPos + 1) * 7));
  }
  if (rule.byMonthDay !== null) {
    const start = addMonths(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)), rule.interval);
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(rule.byMonthDay, lastDay));
    return start;
  }
  return addMonths(date, rule.interval);
}

function nextWeeklyFixed(date: Date, rule: Rule): Date {
  const days = rule.byDay.length === 0 ? [date.getUTCDay()] : rule.byDay.map((day) => WEEKDAYS[day] ?? 1);
  for (let offset = 1; offset <= 7 * rule.interval + 7; offset += 1) {
    const candidate = new Date(date.getTime() + offset * 24 * 60 * 60 * 1000);
    const weekDelta = Math.floor(offset / 7);
    if (weekDelta % rule.interval !== 0 && weekDelta > 0) {
      continue;
    }
    if (days.includes(candidate.getUTCDay())) {
      return candidate;
    }
  }
  return new Date(date.getTime() + 7 * rule.interval * 24 * 60 * 60 * 1000);
}

// En mode AFTER_COMPLETION, l'intervalle part de la date de complétion :
// une tâche hebdomadaire terminée un mercredi revient le mercredi suivant.
function nextAfterCompletion(date: Date, rule: Rule): Date {
  if (rule.freq === "DAILY") {
    return new Date(date.getTime() + rule.interval * 24 * 60 * 60 * 1000);
  }
  if (rule.freq === "WEEKLY") {
    return new Date(date.getTime() + rule.interval * 7 * 24 * 60 * 60 * 1000);
  }
  if (rule.freq === "MONTHLY") {
    return addMonths(date, rule.interval);
  }
  return clampAnnual(date, rule.interval);
}

function clampAnnual(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

function nextFixed(date: Date, rule: Rule): Date {
  if (rule.freq === "DAILY") {
    return new Date(date.getTime() + rule.interval * 24 * 60 * 60 * 1000);
  }
  if (rule.freq === "WEEKLY") {
    return nextWeeklyFixed(date, rule);
  }
  if (rule.freq === "MONTHLY") {
    return nextMonthly(date, rule);
  }
  return clampAnnual(date, rule.interval);
}

/**
 * Prochaine occurrence d'une RRULE simple (RF-28). En mode `FIXED`, la base
 * est l'échéance précédente ; en `AFTER_COMPLETION`, la base est la date de
 * complétion et l'intervalle est appliqué tel quel (pas de rattrapage).
 */
export function nextOccurrence(
  rrule: string,
  previousDueDate: string,
  mode: RecurrenceMode,
  completedOn: string,
): string {
  const rule = parseRule(rrule);
  if (mode === "AFTER_COMPLETION") {
    return toIsoDate(nextAfterCompletion(fromIsoDate(completedOn), rule));
  }
  return toIsoDate(nextFixed(fromIsoDate(previousDueDate), rule));
}
