import { describe, expect, it } from "vitest";
import { parseQuickTask } from "./parse-quick-task";

// NOW est un mercredi 25 novembre 2026.
const NOW = new Date(2026, 10, 25, 10, 0, 0);

describe("parseQuickTask", () => {
  it("extrait la priorité et l'échéance sans perdre le texte restant", () => {
    expect(parseQuickTask("Appeler le comptable demain !haute #admin", { now: NOW })).toEqual({
      title: "Appeler le comptable",
      priority: "HIGH",
      dueDate: "2026-11-26",
      tagNames: ["admin"],
    });
  });

  it("interprète un jour de la semaine comme le prochain", () => {
    expect(parseQuickTask("Bilan lundi", { now: NOW })).toEqual({
      title: "Bilan",
      priority: "NONE",
      dueDate: "2026-11-30",
      tagNames: [],
    });
  });

  it("reporte une date courte déjà passée sur l'année suivante", () => {
    expect(parseQuickTask("Impôts 12/03", { now: NOW })).toEqual({
      title: "Impôts",
      priority: "NONE",
      dueDate: "2027-03-12",
      tagNames: [],
    });
  });

  it("laisse le texte intact quand la date est impossible", () => {
    expect(parseQuickTask("Inventaire 31/02", { now: NOW })).toEqual({
      title: "Inventaire 31/02",
      priority: "NONE",
      tagNames: [],
    });
  });

  it("reprend la saisie quand tout le texte est syntaxique", () => {
    expect(parseQuickTask("!urgent", { now: NOW })).toEqual({
      title: "!urgent",
      priority: "URGENT",
      tagNames: [],
    });
  });

  it("ignore la casse des mots-clés", () => {
    expect(parseQuickTask("Sport DEMAIN !Urgent", { now: NOW })).toEqual({
      title: "Sport",
      priority: "URGENT",
      dueDate: "2026-11-26",
      tagNames: [],
    });
  });

  it("extrait l'heure quand une échéance est présente", () => {
    expect(parseQuickTask("Réunion demain 9h30", { now: NOW })).toEqual({
      title: "Réunion",
      priority: "NONE",
      dueDate: "2026-11-26",
      dueTime: "09:30",
      tagNames: [],
    });
  });

  it("extrait le projet et les tags multiples", () => {
    expect(parseQuickTask("Préparer le devis @ClientA #urgent #vente", { now: NOW })).toEqual({
      title: "Préparer le devis",
      priority: "NONE",
      tagNames: ["urgent", "vente"],
      projectName: "ClientA",
    });
  });

  it("traduit une récurrence simple en RRULE", () => {
    expect(parseQuickTask("Sport lundi *hebdo", { now: NOW })).toEqual({
      title: "Sport",
      priority: "NONE",
      dueDate: "2026-11-30",
      tagNames: [],
      recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=MO",
    });
  });
});
