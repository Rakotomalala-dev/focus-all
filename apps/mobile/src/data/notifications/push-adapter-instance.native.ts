import * as Notifications from "expo-notifications";
import type { PushAdapter, PushPermission } from "./push-registration";

function toPermission(status: string): PushPermission {
  if (status === "granted" || status === "denied") return status;
  return "undetermined";
}

export const platformPushAdapter: PushAdapter = {
  getPermission: async () => toPermission((await Notifications.getPermissionsAsync()).status),

  requestPermission: async () =>
    toPermission((await Notifications.requestPermissionsAsync()).status),

  getExpoPushToken: async () => {
    try {
      const { data } = await Notifications.getExpoPushTokenAsync();
      return data;
    } catch {
      // Simulateur, Expo Go sans projet EAS ou service indisponible : le push
      // n'est pas disponible, la notification locale reste planifiée.
      return null;
    }
  },
};
