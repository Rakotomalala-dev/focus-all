import i18n from "../../i18n";
import { useSessionStore } from "../auth/session-store";
import { notificationsApi } from "./notification-api";
import { notificationScheduler } from "./notification-scheduler-instance";
import { platformPushAdapter } from "./push-adapter-instance";
import { createReminderSync } from "./reminder-sync";

// Point d'entrée utilisé par les mutations de tâches : planifie ou annule les
// notifications locales de la tâche après confirmation serveur.
export const reminderSync = createReminderSync({
  api: notificationsApi,
  scheduler: notificationScheduler,
  push: platformPushAdapter,
  timezone: () =>
    useSessionStore.getState().user?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  now: () => new Date(),
  translate: (key) => i18n.t(key),
});
