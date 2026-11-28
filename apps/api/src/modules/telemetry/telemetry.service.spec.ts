import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { TelemetryEvent } from "@focus/contracts";
import type { AuthContext } from "../auth/auth-context";
import type { TelemetryRepository } from "./telemetry.repository";
import { TelemetryService } from "./telemetry.service";

const AUTH: AuthContext = {
  userId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4ea1",
  workspaceId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4ea2",
};

function setup(enabled: boolean) {
  const events: TelemetryEvent[] = [];
  const repository: TelemetryRepository = {
    isEnabled: async () => enabled,
    record: async (event) => {
      events.push(event);
    },
  };
  return { service: new TelemetryService(repository), events };
}

describe("TelemetryService (RF-72)", () => {
  it("n'écrit rien quand la télémétrie est désactivée (défaut)", async () => {
    const { service, events } = setup(false);

    await service.record(AUTH, { name: "app_open" });

    expect(events).toEqual([]);
  });

  it("enregistre un événement anonyme quand l'utilisateur a consenti", async () => {
    const { service, events } = setup(true);

    await service.record(AUTH, {
      name: "task_created",
      properties: { source: "quick_add", hasDueDate: true },
    });

    expect(events).toEqual([
      { name: "task_created", properties: { source: "quick_add", hasDueDate: true } },
    ]);
    expect(events[0]).not.toHaveProperty("userId");
  });

  it("refuse un événement hors liste ou des propriétés excessives", async () => {
    const { service, events } = setup(true);
    const tooMany = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`key${index}`, index]),
    );

    await expect(
      service.record(AUTH, { name: "unknown_event" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.record(AUTH, { name: "app_open", properties: tooMany }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events).toEqual([]);
  });
});
