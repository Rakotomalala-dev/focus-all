import type { Device, DevicePlatform } from "@focus/contracts";
import type { DeviceStore } from "./device-storage";
import type { NotificationsApi } from "./notification-api";

// RF-51 : Android au MVP via Expo Push. L'enregistrement est idempotent côté
// serveur (même `deviceId`), et un jeton absent n'empêche pas la planification
// locale : sur un simulateur ou sans projet EAS, seul le push est indisponible.
export type PushPermission = "granted" | "denied" | "undetermined";

export type PushAdapter = {
  readonly getPermission: () => Promise<PushPermission>;
  readonly requestPermission: () => Promise<PushPermission>;
  readonly getExpoPushToken: () => Promise<string | null>;
};

export type PushRegistrationDeps = {
  readonly api: Pick<NotificationsApi, "registerDevice" | "updateDevice">;
  readonly store: DeviceStore;
  readonly push: PushAdapter;
  readonly platform: DevicePlatform;
};

export type PushRegistration = {
  /** Demande la permission si nécessaire, enregistre l'appareil et son jeton. */
  readonly register: () => Promise<Device | null>;
  readonly setNotificationsEnabled: (enabled: boolean) => Promise<Device | null>;
  /** Retire le jeton à la déconnexion sans supprimer l'historique de l'appareil. */
  readonly unregister: () => Promise<void>;
};

export function createPushRegistration(deps: PushRegistrationDeps): PushRegistration {
  async function register(): Promise<Device | null> {
    let permission = await deps.push.getPermission();
    if (permission === "undetermined") {
      permission = await deps.push.requestPermission();
    }
    // Permission refusée : ne pas enregistrer d'appareil silencieusement
    // désactivé, l'utilisateur doit pouvoir l'activer explicitement.
    if (permission !== "granted") {
      return null;
    }

    const token = await deps.push.getExpoPushToken();
    const stored = await deps.store.read();
    const device = await deps.api.registerDevice({
      ...(stored === null ? {} : { deviceId: stored.deviceId }),
      platform: deps.platform,
      ...(token === null ? {} : { pushToken: token }),
      notificationsEnabled: true,
    });
    await deps.store.write({
      deviceId: device.id,
      notificationsEnabled: device.notificationsEnabled,
    });
    return device;
  }

  return {
    register,

    setNotificationsEnabled: async (enabled) => {
      const stored = await deps.store.read();
      if (stored === null) {
        return enabled ? register() : null;
      }
      const device = await deps.api.updateDevice(stored.deviceId, {
        notificationsEnabled: enabled,
      });
      await deps.store.write({
        deviceId: device.id,
        notificationsEnabled: device.notificationsEnabled,
      });
      return device;
    },

    unregister: async () => {
      const stored = await deps.store.read();
      if (stored === null) return;
      await deps.api.updateDevice(stored.deviceId, { pushToken: null });
      await deps.store.write(null);
    },
  };
}
