import type { UpdateNotificationPreferences } from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deviceStore } from "../../../data/notifications/device-storage";
import { notificationsApi } from "../../../data/notifications/notification-api";
import { pushRegistration } from "../../../data/notifications/push-registration-instance";
import { reminderSync } from "../../../data/notifications/reminder-sync-instance";
import { taskRepository } from "../../../data/tasks/task-repository-instance";

export const NOTIFICATION_PREFERENCES_KEY = ["notifications", "preferences"] as const;
export const NOTIFICATION_DEVICES_KEY = ["notifications", "devices"] as const;
export const NOTIFICATION_DEVICE_KEY = ["notifications", "device"] as const;

async function rescheduleAllReminders(): Promise<void> {
  const page = await taskRepository.list({
    limit: 100,
    sort: "DUE_DATE",
    includeCompleted: false,
  });
  await reminderSync.syncAll(page.items);
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATION_PREFERENCES_KEY,
    queryFn: () => notificationsApi.preferences(),
    staleTime: 30_000,
  });
}

export function useNotificationDevices() {
  return useQuery({
    queryKey: NOTIFICATION_DEVICES_KEY,
    queryFn: () => notificationsApi.devices(),
  });
}

export function useStoredDevice() {
  return useQuery({
    queryKey: NOTIFICATION_DEVICE_KEY,
    queryFn: () => deviceStore.read(),
  });
}

// Activation explicite : c'est le moment de l'usage, donc le seul endroit où la
// permission système est demandée (RF-51, AGENTS §6).
export function useRegisterPushDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pushRegistration.register(),
    onSuccess: async (device) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_DEVICE_KEY }),
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_DEVICES_KEY }),
      ]);
      if (device !== null) {
        await rescheduleAllReminders();
      }
    },
  });
}

export function useSetDeviceNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => pushRegistration.setNotificationsEnabled(enabled),
    onSuccess: async (_device, enabled) => {
      if (!enabled) {
        await reminderSync.cancelAll();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_DEVICE_KEY }),
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_DEVICES_KEY }),
      ]);
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateNotificationPreferences) =>
      notificationsApi.updatePreferences(patch),
    onSuccess: async (preferences) => {
      await queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY });
      if (!preferences.remindersEnabled) {
        await reminderSync.cancelAll();
        return;
      }
      // Un changement de plage silencieuse ou de catégorie doit replanifier les
      // rappels déjà connus, pas seulement les tâches modifiées ensuite.
      await rescheduleAllReminders();
    },
  });
}
