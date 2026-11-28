import type { PushAdapter } from "./push-registration";

// Résolution par défaut (tests, outils) : Metro choisit `.native.ts` sur mobile
// et `.web.ts` sur le Web.
export const platformPushAdapter: PushAdapter = {
  getPermission: async () => "denied",
  requestPermission: async () => "denied",
  getExpoPushToken: async () => null,
};
