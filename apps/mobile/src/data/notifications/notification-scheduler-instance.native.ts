import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import i18n from "../../i18n";
import type { ReminderScheduler } from "./reminder-sync";

// RF-50 : planification locale Android. Le canal est créé à la première
// planification ; le handler affiche aussi la notification quand l'application
// est ouverte, sinon Android la livre sans lui.
export const REMINDER_CHANNEL_ID = "reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: i18n.t("notifications.channel"),
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

function taskIdOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("taskId" in data)) return null;
  return typeof data.taskId === "string" ? data.taskId : null;
}

export const notificationScheduler: ReminderScheduler = {
  cancelAll: async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  cancelTask: async (taskId) => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of scheduled) {
      if (taskIdOf(request.content.data) === taskId) {
        await Notifications.cancelScheduledNotificationAsync(request.identifier);
      }
    }
  },

  schedule: async ({ taskId, title, body, postponedBody, plans }) => {
    await ensureChannel();
    let scheduled = 0;
    for (const plan of plans) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          // RF-50 : mention explicite lorsqu'un rappel a été décalé hors plage.
          body: plan.postponed ? postponedBody : body,
          data: { taskId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(plan.scheduledFor),
          channelId: REMINDER_CHANNEL_ID,
        },
      });
      scheduled += 1;
    }
    return scheduled;
  },
};
