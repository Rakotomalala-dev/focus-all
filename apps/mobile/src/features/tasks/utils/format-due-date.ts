// ADR-017/ADR-018 : `dueDate` est une date civile (pas d'heure, pas de fuseau) ;
// on la lit à minuit local et on la formate avec `Intl`, jamais à la main.
export function formatDueDate(dueDate: string, locale: string): string {
  const date = new Date(`${dueDate}T00:00:00`);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}
