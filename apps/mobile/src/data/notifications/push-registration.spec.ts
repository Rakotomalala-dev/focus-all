import { deviceSchema } from "@focus/contracts";
import { describe, expect, it, vi } from "vitest";
import type { DeviceStore, StoredDevice } from "./device-storage";
import { createPushRegistration, type PushAdapter } from "./push-registration";

function memoryStore(initial: StoredDevice | null = null) {
  let value = initial;
  const store: DeviceStore = {
    read: async () => value,
    write: async (next) => {
      value = next;
    },
  };
  return { store, current: () => value };
}

const DEVICE = deviceSchema.parse({
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e71",
  platform: "ANDROID",
  pushToken: "ExponentPushToken[abc]",
  deviceName: null,
  notificationsEnabled: true,
  lastSeenAt: "2026-11-28T10:00:00.000Z",
  createdAt: "2026-11-28T10:00:00.000Z",
});

function setup(options: {
  permission?: "granted" | "denied" | "undetermined";
  requested?: "granted" | "denied";
  token?: string | null;
  stored?: StoredDevice | null;
}) {
  const { store, current } = memoryStore(options.stored ?? null);
  const push: PushAdapter = {
    getPermission: vi.fn(async () => options.permission ?? ("granted" as const)),
    requestPermission: vi.fn(async () => options.requested ?? ("granted" as const)),
    getExpoPushToken: vi.fn(async () =>
      options.token === undefined ? "ExponentPushToken[abc]" : options.token,
    ),
  };
  const api = {
    registerDevice: vi.fn(async () => DEVICE),
    updateDevice: vi.fn(async () => ({ ...DEVICE, notificationsEnabled: false })),
  };
  const registration = createPushRegistration({
    api,
    store,
    push,
    platform: "ANDROID",
  });
  return { registration, api, push, store, current };
}

describe("pushRegistration", () => {
  it("enregistre l'appareil avec le jeton Expo quand la permission est accordée", async () => {
    const { registration, api, current } = setup({});

    const device = await registration.register();

    expect(device).toEqual(DEVICE);
    expect(api.registerDevice).toHaveBeenCalledWith({
      platform: "ANDROID",
      pushToken: "ExponentPushToken[abc]",
      notificationsEnabled: true,
    });
    expect(current()).toEqual({ deviceId: DEVICE.id, notificationsEnabled: true });
  });

  it("réutilise l'identifiant d'appareil déjà enregistré", async () => {
    const { registration, api } = setup({
      stored: { deviceId: DEVICE.id, notificationsEnabled: true },
    });

    await registration.register();

    expect(api.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: DEVICE.id }),
    );
  });

  it("demande la permission quand elle n'a pas encore été décidée", async () => {
    const { registration, api, push } = setup({
      permission: "undetermined",
      requested: "granted",
    });

    await registration.register();

    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    expect(api.registerDevice).toHaveBeenCalledTimes(1);
  });

  it("n'enregistre rien si la permission est refusée", async () => {
    const { registration, api, push, current } = setup({ permission: "denied" });

    expect(await registration.register()).toBeNull();
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(api.registerDevice).not.toHaveBeenCalled();
    expect(current()).toBeNull();
  });

  it("enregistre un appareil sans jeton quand Expo Push est indisponible", async () => {
    const { registration, api } = setup({ token: null });

    await registration.register();

    expect(api.registerDevice).toHaveBeenCalledWith({
      platform: "ANDROID",
      notificationsEnabled: true,
    });
  });

  it("active l'appareil déjà connu par un PATCH", async () => {
    const { registration, api } = setup({
      stored: { deviceId: DEVICE.id, notificationsEnabled: false },
    });

    await registration.setNotificationsEnabled(true);

    expect(api.updateDevice).toHaveBeenCalledWith(DEVICE.id, { notificationsEnabled: true });
  });

  it("retire le jeton à la déconnexion et oublie l'appareil local", async () => {
    const { registration, api, current } = setup({
      stored: { deviceId: DEVICE.id, notificationsEnabled: true },
    });

    await registration.unregister();

    expect(api.updateDevice).toHaveBeenCalledWith(DEVICE.id, { pushToken: null });
    expect(current()).toBeNull();
  });
});
