import type * as SecureStoreModule from "expo-secure-store";
import { Platform } from "react-native";

// L'identifiant d'appareil renvoyé par le serveur est conservé pour que chaque
// démarrage mette à jour la même ligne `Device` au lieu d'en créer une nouvelle
// (RF-51 : désactivation par appareil).
export type StoredDevice = {
  readonly deviceId: string;
  readonly notificationsEnabled: boolean;
};

export type DeviceStore = {
  readonly read: () => Promise<StoredDevice | null>;
  readonly write: (value: StoredDevice | null) => Promise<void>;
};

const DEVICE_KEY = "focus.device";

let webDevice: StoredDevice | null = null;

async function secureStore(): Promise<typeof SecureStoreModule> {
  return import("expo-secure-store");
}

export function isStoredDevice(value: unknown): value is StoredDevice {
  if (typeof value !== "object" || value === null) return false;
  if (!("deviceId" in value) || !("notificationsEnabled" in value)) return false;
  return (
    typeof value.deviceId === "string" &&
    value.deviceId.length > 0 &&
    typeof value.notificationsEnabled === "boolean"
  );
}

export function createDeviceStore(): DeviceStore {
  return {
    read: async () => {
      if (Platform.OS === "web") {
        return webDevice;
      }
      const store = await secureStore();
      const raw = await store.getItemAsync(DEVICE_KEY);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isStoredDevice(parsed) ? parsed : null;
      } catch {
        // Entrée illisible : elle est purgée, l'appareil sera réenregistré.
        await store.deleteItemAsync(DEVICE_KEY);
        return null;
      }
    },

    write: async (value) => {
      if (Platform.OS === "web") {
        webDevice = value;
        return;
      }
      const store = await secureStore();
      if (value === null) {
        await store.deleteItemAsync(DEVICE_KEY);
        return;
      }
      await store.setItemAsync(DEVICE_KEY, JSON.stringify(value));
    },
  };
}

export const deviceStore = createDeviceStore();
