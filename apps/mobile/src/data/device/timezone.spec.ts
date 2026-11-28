import { timezoneSchema } from "@focus/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectTimezone } from "./timezone";

describe("detectTimezone (RF-04)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renvoie un fuseau IANA valide sur la plateforme", () => {
    const zone = detectTimezone();

    expect(zone === undefined || timezoneSchema.safeParse(zone).success).toBe(true);
  });

  it("ignore une valeur invalide plutôt que de bloquer l'inscription", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Invalid/Zone" }),
    } as Intl.DateTimeFormat);

    expect(detectTimezone()).toBeUndefined();
  });
});
