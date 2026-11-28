import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_RETENTION_DAYS,
  AccountPurgeService,
  type AccountPurgeStore,
} from "./account-purge.service";

function setup() {
  const purgeDeletedBefore = vi.fn(async (_cutoff: Date) => 2);
  const store: AccountPurgeStore = { purgeDeletedBefore };
  return { service: new AccountPurgeService(store), purgeDeletedBefore };
}

describe("AccountPurgeService (RF-06)", () => {
  it("purge uniquement les comptes supprimés depuis 30 jours", async () => {
    const { service, purgeDeletedBefore } = setup();
    const now = new Date("2026-12-28T12:00:00.000Z");

    expect(await service.purgeExpired(now)).toBe(2);

    const cutoff = purgeDeletedBefore.mock.calls[0]?.[0];
    expect(cutoff).toBeInstanceOf(Date);
    expect(now.getTime() - (cutoff?.getTime() ?? 0)).toBe(
      ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("ne purge rien quand le store ne trouve aucun compte échu", async () => {
    const purgeDeletedBefore = vi.fn(async (_cutoff: Date) => 0);
    const service = new AccountPurgeService({ purgeDeletedBefore });

    expect(await service.purgeExpired(new Date("2026-11-28T12:00:00.000Z"))).toBe(0);
  });
});
