// Charge d'une journée, en minutes : `7 h 30` plutôt que `450`.
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest.toString().padStart(2, "0")}`;
}
