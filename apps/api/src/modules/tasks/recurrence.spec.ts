import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./recurrence";

// 30 novembre 2026 est un lundi ; le 2 décembre 2026 un mercredi.
describe("nextOccurrence (RF-28)", () => {
  it("en date fixe, repart de l'échéance précédente et non de la complétion", () => {
    expect(
      nextOccurrence("RRULE:FREQ=WEEKLY;BYDAY=MO", "2026-11-30", "FIXED", "2026-12-02"),
    ).toBe("2026-12-07");
  });

  it("après complétion, applique l'intervalle depuis le mercredi de complétion", () => {
    expect(
      nextOccurrence(
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "2026-11-30",
        "AFTER_COMPLETION",
        "2026-12-02",
      ),
    ).toBe("2026-12-09");
    expect(
      nextOccurrence("RRULE:FREQ=DAILY", "2026-11-30", "AFTER_COMPLETION", "2026-12-02"),
    ).toBe("2026-12-03");
  });

  it("respecte INTERVAL pour les fréquences simples", () => {
    expect(nextOccurrence("RRULE:FREQ=DAILY;INTERVAL=3", "2026-11-30", "FIXED", "")).toBe(
      "2026-12-03",
    );
    expect(
      nextOccurrence("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", "2026-11-30", "FIXED", ""),
    ).toBe("2026-12-14");
  });

  it("gère le jour du mois et le nième jour de semaine", () => {
    expect(
      nextOccurrence("RRULE:FREQ=MONTHLY;BYMONTHDAY=31", "2027-01-31", "FIXED", ""),
    ).toBe("2027-02-28");
    expect(
      nextOccurrence("RRULE:FREQ=MONTHLY;BYDAY=2TU", "2026-11-10", "FIXED", ""),
    ).toBe("2026-12-08");
    expect(
      nextOccurrence("RRULE:FREQ=MONTHLY;BYDAY=-1MO", "2026-11-30", "FIXED", ""),
    ).toBe("2026-12-28");
  });

  it("ramène le 29 février au 28 les années non bissextiles", () => {
    expect(nextOccurrence("RRULE:FREQ=YEARLY", "2028-02-29", "FIXED", "")).toBe("2029-02-28");
  });

  it("ne produit qu'une occurrence, sans rattrapage en cascade", () => {
    expect(
      nextOccurrence(
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "2026-01-05",
        "FIXED",
        "2026-01-07",
      ),
    ).toBe("2026-01-12");
  });

  it("refuse une RRULE non prise en charge", () => {
    expect(() => nextOccurrence("FREQ=DAILY", "2026-11-30", "FIXED", "")).toThrow();
    expect(() => nextOccurrence("RRULE:FREQ=HOURLY", "2026-11-30", "FIXED", "")).toThrow();
  });
});
