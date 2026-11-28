import type { DevicePlatform } from "@focus/contracts";
import { Platform } from "react-native";
import { deviceStore } from "./device-storage";
import { notificationsApi } from "./notification-api";
import { platformPushAdapter } from "./push-adapter-instance";
import { createPushRegistration } from "./push-registration";

export function devicePlatformOf(platform: string): DevicePlatform {
  switch (platform) {
    case "android":
      return "ANDROID";
    case "ios":
      return "IOS";
    case "web":
      return "WEB";
    case "windows":
    case "macos":
      return "DESKTOP";
    default:
      return "WEB";
  }
}

export const pushRegistration = createPushRegistration({
  api: notificationsApi,
  store: deviceStore,
  push: platformPushAdapter,
  platform: devicePlatformOf(Platform.OS),
});
