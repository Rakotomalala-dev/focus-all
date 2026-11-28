import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  telemetry: vi.fn(),
  user: { telemetryEnabled: false } as { telemetryEnabled: boolean } | null,
}));

vi.mock("../auth/auth-instance", () => ({
  authApi: { telemetry: mocks.telemetry },
}));

vi.mock("../auth/session-store", () => ({
  useSessionStore: {
    getState: () => ({ user: mocks.user }),
  },
}));

import { trackTelemetry } from "./telemetry";

describe("trackTelemetry (RF-72)", () => {
  beforeEach(() => {
    mocks.telemetry.mockReset();
    mocks.user = { telemetryEnabled: false };
  });

  it("n'émet aucune requête sans consentement", async () => {
    await trackTelemetry("app_open");

    expect(mocks.telemetry).not.toHaveBeenCalled();
  });

  it("émet l'événement quand la télémétrie est activée", async () => {
    mocks.user = { telemetryEnabled: true };

    await trackTelemetry("task_created", { source: "quick_add" });

    expect(mocks.telemetry).toHaveBeenCalledWith({
      name: "task_created",
      properties: { source: "quick_add" },
    });
  });

  it("avale un échec réseau sans impacter l'action", async () => {
    mocks.user = { telemetryEnabled: true };
    mocks.telemetry.mockRejectedValueOnce(new Error("offline"));

    await expect(trackTelemetry("app_open")).resolves.toBeUndefined();
  });
});
