import { timezoneSchema } from "@focus/contracts";

// RF-04 : détection initiale du fuseau à l'inscription. Une valeur absente ou
// invalide laisse le serveur appliquer son défaut sûr (Europe/Paris).
export function detectTimezone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezoneSchema.safeParse(zone).success ? zone : undefined;
  } catch {
    return undefined;
  }
}
