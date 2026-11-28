import type { ReminderScheduler } from "./reminder-sync";

// Web Push est hors M1 (RF-51 : Android au MVP) : le Web n'expose pas les
// notifications locales du module natif et ne doit pas l'embarquer.
export const notificationScheduler: ReminderScheduler = {
  cancelAll: async () => undefined,
  cancelTask: async () => undefined,
  schedule: async () => 0,
};
