import { describe, expect, it } from "vitest";
import { localDateIn } from "./local-date";

describe("localDateIn (RF-25)", () => {
  // 23 h 30 UTC : déjà le lendemain à Paris, encore le même jour à New York.
  const LATE_EVENING = new Date("2026-11-28T23:30:00.000Z");

  it("applique la frontière civile du fuseau utilisateur", () => {
    expect(localDateIn("Europe/Paris", LATE_EVENING)).toBe("2026-11-29");
    expect(localDateIn("America/New_York", LATE_EVENING)).toBe("2026-11-28");
  });

  it("retombe sur UTC pour un fuseau invalide", () => {
    expect(localDateIn("Mars/Olympus", LATE_EVENING)).toBe("2026-11-28");
  });
});
