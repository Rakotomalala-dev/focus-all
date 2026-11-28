import type { TelemetryEventName } from "@focus/contracts";
import { authApi } from "../auth/auth-instance";
import { useSessionStore } from "../auth/session-store";

// RF-72 : aucune requête n'est émise sans consentement explicite. L'échec est
// silencieux : la télémétrie ne doit jamais dégrader une action utilisateur.
export async function trackTelemetry(
  name: TelemetryEventName,
  properties?: Readonly<Record<string, string | number | boolean>>,
): Promise<void> {
  if (useSessionStore.getState().user?.telemetryEnabled !== true) {
    return;
  }
  try {
    await authApi.telemetry({ name, ...(properties === undefined ? {} : { properties }) });
  } catch {
    // Best effort, sans nouvelle tentative ni bruit dans l'UI.
  }
}
