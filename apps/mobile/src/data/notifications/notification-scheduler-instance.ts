import type { ReminderScheduler } from "./reminder-sync";

// Résolution par défaut (tests, outils) : Metro choisit `.native.ts` sur mobile
// et `.web.ts` sur le Web.
export const notificationScheduler: ReminderScheduler = {
  cancelAll: async () => undefined,
  cancelTask: async () => undefined,
  schedule: async () => 0,
};
