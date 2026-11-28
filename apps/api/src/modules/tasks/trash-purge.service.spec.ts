import { describe, expect, it, vi } from "vitest";
import {
  TRASH_RETENTION_DAYS,
  TrashPurgeService,
  type TrashPurgeStore,
} from "./trash-purge.service";

function setup() {
  const purgeTrashedBefore = vi.fn(async (_cutoff: Date) => ({ tasks: 3, projects: 1 }));
  const store: TrashPurgeStore = { purgeTrashedBefore };
  return { service: new TrashPurgeService(store), purgeTrashedBefore };
}

describe("TrashPurgeService (RF-29)", () => {
  it("purge la corbeille au-delà de 30 jours, tâches et projets", async () => {
    const { service, purgeTrashedBefore } = setup();
    const now = new Date("2026-12-28T12:00:00.000Z");

    expect(await service.purgeExpired(now)).toEqual({ tasks: 3, projects: 1 });

    const cutoff = purgeTrashedBefore.mock.calls[0]?.[0];
    expect(cutoff).toBeInstanceOf(Date);
    expect(now.getTime() - (cutoff?.getTime() ?? 0)).toBe(
      TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("conserve les éléments récents et renvoie des compteurs nuls", async () => {
    const purgeTrashedBefore = vi.fn(async (_cutoff: Date) => ({ tasks: 0, projects: 0 }));
    const service = new TrashPurgeService({ purgeTrashedBefore });

    expect(await service.purgeExpired(new Date("2026-11-28T12:00:00.000Z"))).toEqual({
      tasks: 0,
      projects: 0,
    });
  });
});
