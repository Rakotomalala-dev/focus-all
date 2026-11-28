import { describe, expect, it } from "vitest";
import { problemDetailsSchema } from "./problem-details";
import { MAX_TASK_TITLE_LENGTH, pageQuerySchema, taskDraftSchema, taskSchema } from "./task";

const WORKSPACE_ID = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f";
const TASK_ID = "018f3b3c-1a2b-7c3d-8e4f-1a2b3c4d5e6f";
const NOW = "2026-11-24T10:00:00.000Z";

describe("taskDraftSchema", () => {
  it("applique les valeurs par défaut et rogne le titre", () => {
    const draft = taskDraftSchema.parse({ title: "  Écrire les tests  " });

    expect(draft.title).toBe("Écrire les tests");
    expect(draft.priority).toBe("NONE");
    expect(draft.tagIds).toEqual([]);
  });

  it("refuse un titre vide ou trop long", () => {
    expect(taskDraftSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(
      taskDraftSchema.safeParse({ title: "a".repeat(MAX_TASK_TITLE_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("refuse une priorité inconnue et un identifiant non UUID", () => {
    expect(taskDraftSchema.safeParse({ title: "T", priority: "CRITICAL" }).success).toBe(false);
    expect(taskDraftSchema.safeParse({ title: "T", projectId: "42" }).success).toBe(false);
  });

  it("refuse une échéance avec heure (date civile uniquement, ADR-017)", () => {
    expect(taskDraftSchema.safeParse({ title: "T", dueDate: "2026-11-24" }).success).toBe(true);
    expect(taskDraftSchema.safeParse({ title: "T", dueDate: NOW }).success).toBe(false);
  });
});

describe("taskSchema", () => {
  const task = {
    id: TASK_ID,
    workspaceId: WORKSPACE_ID,
    title: "Tâche",
    status: "TODO",
    completedAt: null,
    pinned: false,
    sortOrder: "a0",
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("accepte une tâche complète et remplit les valeurs par défaut", () => {
    const parsed = taskSchema.parse(task);

    expect(parsed.priority).toBe("NONE");
    expect(parsed.completedAt).toBeNull();
  });

  it("n'expose pas le workspace, même si le serveur le reçoit (N-3/N-7)", () => {
    const parsed = taskSchema.parse({ ...task, workspaceId: WORKSPACE_ID });

    expect(parsed).not.toHaveProperty("workspaceId");
  });

  it("refuse une version négative", () => {
    expect(taskSchema.safeParse({ ...task, version: -1 }).success).toBe(false);
  });
});

describe("pageQuerySchema", () => {
  it("applique la taille de page par défaut et convertit le paramètre de requête", () => {
    expect(pageQuerySchema.parse({}).limit).toBe(50);
    expect(pageQuerySchema.parse({ limit: "25" }).limit).toBe(25);
  });

  it("refuse une limite hors bornes", () => {
    expect(pageQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("problemDetailsSchema", () => {
  it("accepte une erreur conforme RFC 9457", () => {
    const parsed = problemDetailsSchema.parse({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      code: "NOT_FOUND",
      instance: "/api/v1/tasks",
    });

    expect(parsed.status).toBe(404);
  });

  it("refuse un statut hors plage et un code inconnu", () => {
    expect(
      problemDetailsSchema.safeParse({
        type: "about:blank",
        title: "OK",
        status: 200,
        code: "NOT_FOUND",
      }).success,
    ).toBe(false);
    expect(
      problemDetailsSchema.safeParse({
        type: "about:blank",
        title: "Boom",
        status: 500,
        code: "BOOM",
      }).success,
    ).toBe(false);
  });
});
