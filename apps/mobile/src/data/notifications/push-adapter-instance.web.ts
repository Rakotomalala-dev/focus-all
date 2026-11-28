import type { PushAdapter } from "./push-registration";

// Web Push hors M1 (RF-51) : aucune permission n'est demandée sur le Web, donc
// aucun appareil web n'est enregistré et aucune notification locale n'est
// planifiée. Le contrat d'API reste le même.
export const platformPushAdapter: PushAdapter = {
  getPermission: async () => "denied",
  requestPermission: async () => "denied",
  getExpoPushToken: async () => null,
};
