const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function atLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export type DateShortcut = "TODAY" | "TOMORROW" | "WEEKEND" | "NEXT_MONDAY";

/**
 * RF-25 : dates civiles des raccourcis, calculées dans le fuseau de l'appareil.
 * « Ce week-end » vise le samedi de la semaine courante (le dimanche reste le
 * week-end) ; « lundi prochain » est toujours strictement après aujourd'hui.
 */
export function dateShortcut(kind: DateShortcut, now: Date = new Date()): string {
  const today = atLocalMidnight(now);
  switch (kind) {
    case "TODAY":
      return isoDay(today);
    case "TOMORROW":
      return isoDay(new Date(today.getTime() + DAY_MS));
    case "WEEKEND": {
      const weekday = today.getDay();
      if (weekday === 6 || weekday === 0) {
        return isoDay(today);
      }
      return isoDay(new Date(today.getTime() + (6 - weekday) * DAY_MS));
    }
    case "NEXT_MONDAY": {
      const weekday = today.getDay();
      const delta = ((1 - weekday + 7) % 7) || 7;
      return isoDay(new Date(today.getTime() + delta * DAY_MS));
    }
  }
}
