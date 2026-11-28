// En-têtes de jour des vues Prochain et Calendrier. `dueDate` reste une date
// civile : on la lit à minuit local, jamais comme un instant UTC.
export function formatDay(dueDate: string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${dueDate}T00:00:00`);
  return new Intl.DateTimeFormat(locale, options ?? { weekday: "short", day: "numeric", month: "short" }).format(date);
}

export function dayOfMonth(dueDate: string): number {
  return Number(dueDate.slice(8, 10));
}
