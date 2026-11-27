import type { TaskPriority } from "@focus/contracts";

// RF-20 : analyse légère de la syntaxe naturelle. En cas d'ambiguïté, le texte
// reste dans le titre : rien n'est perdu silencieusement.
export type QuickTask = {
  readonly title: string;
  readonly priority: TaskPriority;
  readonly dueDate?: string;
  readonly dueTime?: string;
  readonly tagNames: readonly string[];
  readonly projectName?: string;
  readonly recurrenceRule?: string;
};

export type QuickTaskOptions = {
  readonly now: Date;
};

const PRIORITY_WORDS: Readonly<Record<string, TaskPriority>> = {
  urgent: "URGENT",
  haute: "HIGH",
  moyenne: "MEDIUM",
  basse: "LOW",
  aucune: "NONE",
};

const WEEKDAYS: Readonly<Record<string, number>> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const RRULE_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const PRIORITY_TOKEN = /^!(urgent|haute|moyenne|basse|aucune)$/i;
const SHORT_DATE_TOKEN = /^(\d{1,2})\/(\d{1,2})$/;
const TIME_TOKEN = /^(\d{1,2})(?:h|:)(\d{2})?$/i;

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseDueDate(token: string, today: Date): string | undefined {
  const word = token.toLowerCase();

  if (word === "demain") {
    return toIsoDate(addDays(today, 1));
  }
  if (word === "aujourd'hui" || word === "aujourdhui") {
    return toIsoDate(today);
  }

  const weekday = WEEKDAYS[word];
  if (weekday !== undefined) {
    const delta = (weekday - today.getDay() + 7) % 7;
    return toIsoDate(addDays(today, delta === 0 ? 7 : delta));
  }

  const shortDate = SHORT_DATE_TOKEN.exec(word);
  if (shortDate === null) {
    return undefined;
  }
  const [, dayText, monthText] = shortDate;
  if (dayText === undefined || monthText === undefined) {
    return undefined;
  }

  const day = Number(dayText);
  const month = Number(monthText);
  let date = new Date(today.getFullYear(), month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  if (date.getTime() < today.getTime()) {
    date = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return toIsoDate(date);
}

function parseTime(token: string): string | undefined {
  const match = TIME_TOKEN.exec(token);
  if (match === null) return undefined;
  const hour = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (hour > 23 || minutes > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function recurrenceFor(token: string, dueDate: string | undefined, today: Date): string | undefined {
  const value = token.slice(1).toLowerCase();
  const base = dueDate === undefined ? today : new Date(`${dueDate}T00:00:00`);
  const day = RRULE_WEEKDAYS[base.getDay()] ?? "MO";

  if (value === "daily" || value === "quotidien" || value === "quotidienne") {
    return "RRULE:FREQ=DAILY";
  }
  if (value === "weekly" || value === "hebdo" || value === "hebdomadaire") {
    return `RRULE:FREQ=WEEKLY;BYDAY=${day}`;
  }
  if (value === "monthly" || value === "mensuel" || value === "mensuelle") {
    return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${base.getDate()}`;
  }
  if (value === "yearly" || value === "annuel" || value === "annuelle") {
    return "RRULE:FREQ=YEARLY";
  }
  const weekday = WEEKDAYS[value];
  if (weekday !== undefined) {
    return `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_WEEKDAYS[weekday]}`;
  }
  return undefined;
}

export function parseQuickTask(input: string, options: QuickTaskOptions): QuickTask {
  const today = new Date(options.now.getFullYear(), options.now.getMonth(), options.now.getDate());
  const tokens = input.trim().split(/\s+/);
  const titleTokens: string[] = [];
  const tagNames: string[] = [];
  let projectName: string | undefined;
  let recurrenceRule: string | undefined;
  let priority: TaskPriority = "NONE";
  let dueDate: string | undefined;
  let dueTime: string | undefined;

  for (const token of tokens) {
    if (PRIORITY_TOKEN.test(token)) {
      const found = PRIORITY_WORDS[token.slice(1).toLowerCase()];
      if (found !== undefined) {
        priority = found;
        continue;
      }
    }

    if (token.startsWith("#") && token.length > 1) {
      tagNames.push(token.slice(1));
      continue;
    }

    if (token.startsWith("@") && token.length > 1) {
      projectName = token.slice(1);
      continue;
    }

    if (token.startsWith("*") && token.length > 1) {
      const rule = recurrenceFor(token, dueDate, today);
      if (rule !== undefined) {
        recurrenceRule = rule;
        continue;
      }
    }

    const parsedDueDate = parseDueDate(token, today);
    if (parsedDueDate !== undefined) {
      dueDate = parsedDueDate;
      continue;
    }

    if (dueDate !== undefined) {
      const parsedTime = parseTime(token);
      if (parsedTime !== undefined) {
        dueTime = parsedTime;
        continue;
      }
    }

    titleTokens.push(token);
  }

  const title = titleTokens.length > 0 ? titleTokens.join(" ") : input.trim();

  return {
    title,
    priority,
    tagNames,
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(dueTime === undefined ? {} : { dueTime }),
    ...(projectName === undefined ? {} : { projectName }),
    ...(recurrenceRule === undefined ? {} : { recurrenceRule }),
  };
}
