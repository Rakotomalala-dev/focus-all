import type { TaskPriority } from "@focus/contracts";

// RF-20 : saisie rapide d'un titre, analyse légère de la syntaxe naturelle.
// Seuls la priorité et l'échéance sont extraites : le contrat `TaskDraft`
// attend `tagIds` (UUID) et un titre de projet, pas un nom — `#tag` et `@projet`
// restent donc dans le titre au lieu d'être perdus silencieusement.
export type QuickTask = {
  readonly title: string;
  readonly priority: TaskPriority;
  readonly dueDate?: string;
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

const PRIORITY_TOKEN = /^!(urgent|haute|moyenne|basse|aucune)$/i;
const SHORT_DATE_TOKEN = /^(\d{1,2})\/(\d{1,2})$/;

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Dates civiles : tout est calculé à minuit local, jamais via UTC (ADR-017).
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
    // Un jour déjà passé dans la semaine désigne le suivant, pas aujourd'hui.
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
  // Une date inexistante (31/02) n'est pas interprétée : le texte reste intact.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  if (date.getTime() < today.getTime()) {
    date = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return toIsoDate(date);
}

export function parseQuickTask(input: string, options: QuickTaskOptions): QuickTask {
  const today = new Date(options.now.getFullYear(), options.now.getMonth(), options.now.getDate());
  const tokens = input.trim().split(/\s+/);
  const titleTokens: string[] = [];
  let priority: TaskPriority = "NONE";
  let dueDate: string | undefined;

  for (const token of tokens) {
    if (PRIORITY_TOKEN.test(token)) {
      const found = PRIORITY_WORDS[token.slice(1).toLowerCase()];
      if (found !== undefined) {
        priority = found;
        continue;
      }
    }

    const parsedDueDate = parseDueDate(token, today);
    if (parsedDueDate !== undefined) {
      dueDate = parsedDueDate;
      continue;
    }

    titleTokens.push(token);
  }

  // Tout le texte a été interprété (ex. « demain » seul) : le titre reprend la
  // saisie d'origine, jamais une chaîne vide.
  const title = titleTokens.length > 0 ? titleTokens.join(" ") : input.trim();

  return dueDate === undefined ? { title, priority } : { title, priority, dueDate };
}
