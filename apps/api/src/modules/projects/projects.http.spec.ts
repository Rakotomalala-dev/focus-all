import {
  problemDetailsSchema,
  projectListResponseSchema,
  projectSchema,
  taskListResponseSchema,
  taskSchema,
  type Project,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestApi,
  type HttpResult,
  type RequestOptions,
  type TestApi,
} from "../../../test/helpers/test-api";

// Vraie application Nest + PostgreSQL : la contrainte d'unicité insensible à la
// casse et le contrôle optimiste ne peuvent pas être prouvés autrement.
let api: TestApi;
let authorization = "";
let otherAuthorization = "";

function request(
  path: string,
  options?: Omit<RequestOptions, "authorization">,
): Promise<HttpResult> {
  return api.request(path, { ...options, authorization });
}

function createProject(payload: unknown): Promise<HttpResult> {
  return request("/api/v1/projects", { method: "POST", body: payload });
}

function parseProject(body: unknown): Project {
  return projectSchema.parse(body);
}

beforeAll(async () => {
  api = await startTestApi();
  authorization = await api.bearerToken(await api.createWorkspace("projects-http"));
  otherAuthorization = await api.bearerToken(await api.createWorkspace("projects-other"));
});

afterAll(async () => {
  await api?.close();
});

describe("projets", () => {
  it("crée un projet avec ses défauts et publie Location et ETag", async () => {
    const result = await createProject({ name: "  Client A  ", color: "blue" });

    expect(result.status).toBe(201);
    const project = parseProject(result.body);
    expect(project.name).toBe("Client A");
    expect(project.color).toBe("blue");
    expect(project.description).toBeNull();
    expect(project.archivedAt).toBeNull();
    expect(project.version).toBe(0);
    expect(result.headers.get("location")).toBe(`/api/v1/projects/${project.id}`);
    expect(result.headers.get("etag")).toBe('"0"');
  });

  it("refuse un doublon insensible à la casse et aux espaces en 409", async () => {
    const result = await createProject({ name: "  client a  " });

    expect(result.status).toBe(409);
    expect(result.contentType).toContain("application/problem+json");
    expect(problemDetailsSchema.parse(result.body).code).toBe("REQUEST_REJECTED");
  });

  it("autorise le même nom dans un autre workspace", async () => {
    const result = await api.request("/api/v1/projects", {
      method: "POST",
      authorization: otherAuthorization,
      body: { name: "Client A" },
    });

    expect(result.status).toBe(201);
  });

  it("liste les projets du workspace courant uniquement", async () => {
    const list = projectListResponseSchema.parse((await request("/api/v1/projects")).body);
    const other = projectListResponseSchema.parse(
      (await api.request("/api/v1/projects", { authorization: otherAuthorization })).body,
    );

    expect(list.items.map((project) => project.name)).toEqual(["Client A"]);
    expect(other.items.map((project) => project.name)).toEqual(["Client A"]);
    expect(list.items[0]?.id).not.toBe(other.items[0]?.id);
  });

  it("renomme, colore et archive avec la version courante", async () => {
    const created = parseProject((await createProject({ name: "Refonte" })).body);

    const renamed = await request(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      body: { name: "Refonte site", color: "amber", version: created.version },
    });
    expect(renamed.status).toBe(200);
    const updated = parseProject(renamed.body);
    expect(updated.name).toBe("Refonte site");
    expect(updated.color).toBe("amber");
    expect(updated.version).toBe(1);

    const archived = await request(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      body: { archived: true, version: updated.version },
    });
    const archivedProject = parseProject(archived.body);
    expect(archivedProject.archivedAt).not.toBeNull();
    expect(archivedProject.version).toBe(2);

    // Désarchiver est réversible : la date repasse à null.
    const restored = parseProject(
      (
        await request(`/api/v1/projects/${created.id}`, {
          method: "PATCH",
          body: { archived: false, version: archivedProject.version },
        })
      ).body,
    );
    expect(restored.archivedAt).toBeNull();
  });

  it("renvoie 409 sur version périmée et 412 via If-Match", async () => {
    const created = parseProject((await createProject({ name: "Conflit" })).body);
    const first = parseProject(
      (
        await request(`/api/v1/projects/${created.id}`, {
          method: "PATCH",
          body: { name: "Conflit v1", version: created.version },
        })
      ).body,
    );

    const stale = await request(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      body: { name: "Conflit v2", version: created.version },
    });
    expect(stale.status).toBe(409);
    expect(problemDetailsSchema.parse(stale.body).code).toBe("CONFLICT_VERSION");

    const precondition = await request(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "if-match": '"0"' },
      body: { name: "Conflit v3" },
    });
    expect(precondition.status).toBe(412);
    expect(problemDetailsSchema.parse(precondition.body).code).toBe("CONFLICT_VERSION");

    const current = await request(`/api/v1/projects/${created.id}`);
    expect(parseProject(current.body).version).toBe(first.version);
  });

  it("refuse un renommage vers un nom déjà pris", async () => {
    const created = parseProject((await createProject({ name: "Unique" })).body);
    await createProject({ name: "Déjà pris" });

    const result = await request(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      body: { name: "déjà PRIS", version: created.version },
    });

    expect(result.status).toBe(409);
    expect(problemDetailsSchema.parse(result.body).code).toBe("REQUEST_REJECTED");
  });

  it("supprime logiquement, retire de la liste et libère le nom", async () => {
    const created = parseProject((await createProject({ name: "À supprimer" })).body);

    const removed = await request(
      `/api/v1/projects/${created.id}?version=${created.version}`,
      { method: "DELETE" },
    );
    expect(removed.status).toBe(204);

    expect((await request(`/api/v1/projects/${created.id}`)).status).toBe(404);
    const list = projectListResponseSchema.parse((await request("/api/v1/projects")).body);
    expect(list.items.map((project) => project.id)).not.toContain(created.id);

    // L'index partiel ne couvre que les projets vivants : le nom est réutilisable.
    expect((await createProject({ name: "à supprimer" })).status).toBe(201);
  });

  it("isole les projets entre workspaces (lecture, écriture, suppression)", async () => {
    const created = parseProject((await createProject({ name: "Privé" })).body);

    const foreignRead = await api.request(`/api/v1/projects/${created.id}`, {
      authorization: otherAuthorization,
    });
    expect(foreignRead.status).toBe(404);

    const foreignUpdate = await api.request(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      authorization: otherAuthorization,
      body: { name: "Volé", version: 0 },
    });
    expect(foreignUpdate.status).toBe(404);

    const foreignDelete = await api.request(
      `/api/v1/projects/${created.id}?version=0`,
      { method: "DELETE", authorization: otherAuthorization },
    );
    expect(foreignDelete.status).toBe(404);

    expect((await request(`/api/v1/projects/${created.id}`)).status).toBe(200);
  });

  it("rattache une tâche au projet puis la remet dans l'Inbox", async () => {
    const project = parseProject((await createProject({ name: "Avec tâches" })).body);
    const task = taskSchema.parse(
      (
        await request("/api/v1/tasks", {
          method: "POST",
          body: { title: "Tâche du projet", projectId: project.id },
        })
      ).body,
    );
    expect(task.projectId).toBe(project.id);

    const cleared = taskSchema.parse(
      (
        await request(`/api/v1/tasks/${task.id}`, {
          method: "PATCH",
          body: { projectId: null, version: task.version },
        })
      ).body,
    );
    expect(cleared.projectId).toBeUndefined();
  });

  it("remet les tâches du projet supprimé dans l'Inbox", async () => {
    const doomed = parseProject((await createProject({ name: "Projet supprimé" })).body);
    const kept = parseProject((await createProject({ name: "Projet conservé" })).body);

    const inDoomed = taskSchema.parse(
      (
        await request("/api/v1/tasks", {
          method: "POST",
          body: { title: "Tâche orpheline", projectId: doomed.id },
        })
      ).body,
    );
    const inKept = taskSchema.parse(
      (
        await request("/api/v1/tasks", {
          method: "POST",
          body: { title: "Tâche conservée", projectId: kept.id },
        })
      ).body,
    );

    const removed = await request(`/api/v1/projects/${doomed.id}?version=${doomed.version}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);

    const moved = taskSchema.parse((await request(`/api/v1/tasks/${inDoomed.id}`)).body);
    expect(moved.projectId).toBeUndefined();
    // La version avance : le client hors ligne reçoit un changement à rejouer.
    expect(moved.version).toBe(inDoomed.version + 1);

    const untouched = taskSchema.parse((await request(`/api/v1/tasks/${inKept.id}`)).body);
    expect(untouched.projectId).toBe(kept.id);
    expect(untouched.version).toBe(inKept.version);

    // Plus aucune tâche n'est listée sur le projet supprimé.
    const page = taskListResponseSchema.parse(
      (await request(`/api/v1/tasks?projectId=${doomed.id}`)).body,
    );
    expect(page.items).toEqual([]);
  });

  it("valide les entrées", async () => {
    const empty = await createProject({ name: "   " });
    expect(empty.status).toBe(400);
    expect(problemDetailsSchema.parse(empty.body).code).toBe("VALIDATION_FAILED");

    const badColor = await createProject({ name: "Couleur", color: "#ff0000" });
    expect(badColor.status).toBe(400);

    const badId = await request("/api/v1/projects/42");
    expect(badId.status).toBe(400);

    const missingVersion = await request(
      "/api/v1/projects/018f3b3c-1a2b-7c3d-8e4f-ffffffffffff",
      { method: "PATCH", body: { name: "Sans version" } },
    );
    expect(missingVersion.status).toBe(400);
  });
});
