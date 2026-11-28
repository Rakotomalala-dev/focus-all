import { describe, expect, it } from "vitest";
import { dateShortcut } from "./date-shortcuts";

// Mercredi 2 décembre 2026, 18 h locale.
const WEDNESDAY = new Date(2026, 11, 2, 18, 0, 0);

describe("dateShortcut (RF-25)", () => {
  it("renvoie aujourd'hui et demain en date civile locale", () => {
    expect(dateShortcut("TODAY", WEDNESDAY)).toBe("2026-12-02");
    expect(dateShortcut("TOMORROW", WEDNESDAY)).toBe("2026-12-03");
  });

  it("vise le samedi de la semaine courante pour ce week-end", () => {
    expect(dateShortcut("WEEKEND", WEDNESDAY)).toBe("2026-12-05");
  });

  it("reste sur le jour courant quand on est déjà le week-end", () => {
    const saturday = new Date(2026, 11, 5, 9, 0, 0);
    const sunday = new Date(2026, 11, 6, 9, 0, 0);

    expect(dateShortcut("WEEKEND", saturday)).toBe("2026-12-05");
    expect(dateShortcut("WEEKEND", sunday)).toBe("2026-12-06");
  });

  it("renvoie strictement le lundi suivant, jamais aujourd'hui", () => {
    const monday = new Date(2026, 11, 7, 9, 0, 0);

    expect(dateShortcut("NEXT_MONDAY", WEDNESDAY)).toBe("2026-12-07");
    expect(dateShortcut("NEXT_MONDAY", monday)).toBe("2026-12-14");
  });
});
