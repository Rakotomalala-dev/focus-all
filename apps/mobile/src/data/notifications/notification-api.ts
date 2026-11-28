import {
  deviceListResponseSchema,
  deviceSchema,
  notificationPreferencesSchema,
  registerDeviceSchema,
  updateDeviceSchema,
  updateNotificationPreferencesSchema,
  type Device,
  type DeviceListResponse,
  type NotificationPreferences,
  type RegisterDeviceInput,
  type UpdateDevice,
  type UpdateNotificationPreferences,
} from "@focus/contracts";
import { authenticatedHttp } from "../auth/auth-instance";
import type { HttpClient } from "../http/client";

// RF-50/RF-51 : préférences par catégorie, plage silencieuse et appareils.
// Chaque réponse est validée par le contrat partagé, comme les autres
// repositories (ADR-009).
export const NOTIFICATION_PREFERENCES_PATH = "/notification-preferences";
export const DEVICES_PATH = "/devices";

const NO_CONTENT = { parse: (): void => undefined };

export type NotificationsApi = {
  readonly preferences: () => Promise<NotificationPreferences>;
  readonly updatePreferences: (
    patch: UpdateNotificationPreferences,
  ) => Promise<NotificationPreferences>;
  readonly devices: () => Promise<DeviceListResponse>;
  readonly registerDevice: (input: RegisterDeviceInput) => Promise<Device>;
  readonly updateDevice: (id: string, patch: UpdateDevice) => Promise<Device>;
  readonly removeDevice: (id: string) => Promise<void>;
};

export function createNotificationsApi(http: HttpClient): NotificationsApi {
  return {
    preferences: () => http.get(NOTIFICATION_PREFERENCES_PATH, notificationPreferencesSchema),

    updatePreferences: async (patch) =>
      http.patch(
        NOTIFICATION_PREFERENCES_PATH,
        updateNotificationPreferencesSchema.parse(patch),
        notificationPreferencesSchema,
      ),

    devices: () => http.get(DEVICES_PATH, deviceListResponseSchema),

    registerDevice: async (input) =>
      http.post(DEVICES_PATH, registerDeviceSchema.parse(input), deviceSchema),

    updateDevice: async (id, patch) =>
      http.patch(`${DEVICES_PATH}/${id}`, updateDeviceSchema.parse(patch), deviceSchema),

    removeDevice: (id) => http.delete(`${DEVICES_PATH}/${id}`, NO_CONTENT),
  };
}

export const notificationsApi = createNotificationsApi(authenticatedHttp);
