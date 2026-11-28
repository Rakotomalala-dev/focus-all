/**
 * Date civile d'un instant dans un fuseau IANA. Une date d'échéance sans heure
 * ne devient jamais « en retard » à minuit UTC : la frontière est le début du
 * jour suivant dans le fuseau de l'utilisateur (RF-25, ADR-017).
 */
export function localDateIn(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? "";
    const year = value("year");
    const month = value("month");
    const day = value("day");
    if (year.length !== 4 || month.length !== 2 || day.length !== 2) {
      return at.toISOString().slice(0, 10);
    }
    return `${year}-${month}-${day}`;
  } catch {
    // Fuseau corrompu ou moteur sans données IANA : le serveur reste sûr.
    return at.toISOString().slice(0, 10);
  }
}
