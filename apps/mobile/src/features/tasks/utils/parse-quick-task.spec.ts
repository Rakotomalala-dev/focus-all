import { describe, expect, it } from "vitest";
import { parseQuickTask } from "./parse-quick-task";

// Mercredi 25 novembre 2026, 9 h 30 locales.
const NOW = new Date(2026, 10, 25, 9, 30);

describe("parseQuickTask", () => {
  it("extrait la priorité et l'échéance sans perdre le texte restant", () => {
    expect(parseQuickTask("Appeler le comptable demain !haute #admin", { now: NOW })).toEqual({
      title: "Appeler le comptable #admin",
      priority: "HIGH",
      dueDate: "2026-11-26",
    });
  });

  it("interprète un jour de la semaine comme le prochain", () => {
    expect(parseQuickTask("Bilan lundi", { now: NOW })).toEqual({
      title: "Bilan",
      priority: "NONE",
      dueDate: "2026-11-30",
    });
  });

  it("reporte une date courte déjà passée sur l'année suivante", () => {
    expect(parseQuickTask("Impôts 12/03", { now: NOW })).toEqual({
      title: "Impôts",
      priority: "NONE",
      dueDate: "2027-03-12",
    });
  });

  it("laisse le texte intact quand la date est impossible", () => {
    expect(parseQuickTask("Inventaire 31/02", { now: NOW })).toEqual({
      title: "Inventaire 31/02",
      priority: "NONE",
    });
  });

  it("reprend la saisie quand tout le texte est syntaxique", () => {
    expect(parseQuickTask("!urgent", { now: NOW })).toEqual({
      title: "!urgent",
      priority: "URGENT",
    });
  });

  it("ignore la casse des mots-clés", () => {
    expect(parseQuickTask("Sport DEMAIN !Urgent", { now: NOW })).toEqual({
      title: "Sport",
      priority: "URGENT",
      dueDate: "2026-11-26",
    });
  });
});
