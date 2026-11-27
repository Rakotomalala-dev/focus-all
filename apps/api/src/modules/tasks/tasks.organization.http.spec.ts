import {
  problemDetailsSchema,
  projectSchema,
  tagSchema,
  taskListResponseSchema,
  taskSchema,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestApi,
  type HttpResult,
  type RequestOptions,
  type TestApi,
} from "../../../test/helpers/test-api";

let api: TestApi;
let authorization = "";

function request(
  path: string,
  options?: Omit<RequestOptions, "authorization">,
): Promise<HttpResult> {
  return api.request(path, { ...options, authorization });
}

async function createProject(name: string) {
  const result = await request("/api/v1/projects", { method: "POST", body: { name } });
  expect(result.status).toBe(201);
  return projectSchema.parse(result.body);
}

async function createTask(payload: Record<string, unknown>) {
  const result = await request("/api/v1/tasks", { method: "POST", body: payload });
  expect(result.status).toBe(201);
  return taskSchema.parse(result.body);
}

async function list(query = "") {
  const result = await request(`/api/v1/tasks${query}`);
  expect(result.status).toBe(200);
  return taskListResponseSchema.parse(result.body);
}

beforeAll(async () => {
  api = await startTestApi();
  authorization = await api.bearerToken(await api.createWorkspace("tasks-organization"));
});

afterAll(async () => {
  await api?.close();
});

describe("RF-20/21/25/26 — métadonnées complètes et filtres", () => {
  it("crée une tâche avec heure, début, rappels, estimation et tags", async () => {
    const tagsResult = await request("/api/v1/tags/ensure", {
      method: "POST",
      body: { names: ["admin", "Maison"] },
    });
    expect(tagsResult.status).toBe(200);
    const tags = (tagsResult.body as unknown[]).map((tag) => tagSchema.parse(tag));
    expect(tags.map((tag) => tag.name)).toEqual(["admin", "maison"]);

    const task = await createTask({
      title: "  Réviser le dossier  ",
      description: "**Important** pour demain",
      dueDate: "2026-12-01",
      dueTime: "09:30",
      startDate: "2026-11-28",
      priority: "HIGH",
      tagIds: tags.map((tag) => tag.id),
      reminders: ["2026-11-30T08:00:00.000Z"],
      estimateMinutes: 45,
    });

    expect(task.title).toBe("Réviser le dossier");
    expect(task.dueTime).toBe("09:30");
    expect(task.startDate).toBe("2026-11-28");
    expect(task.reminders).toEqual(["2026-11-30T08:00:00.000Z"]);
    expect(task.estimateMinutes).toBe(45);
    expect(task.tagIds).toHaveLength(2);
  });

  it("filtre par texte sans accents, priorité, tags (ET) et échéance", async () => {
    const tags = (await request("/api/v1/tags")).body as { items: unknown[] };
    const admin = tagSchema.parse(tags.items[0]);

    const byText = await list(`?q=reviser`);
    expect(byText.items.map((task) => task.title)).toContain("Réviser le dossier");

    const byPriority = await list(`?priority=HIGH`);
    expect(byPriority.items.every((task) => task.priority === "HIGH")).toBe(true);

    const byTags = await list(`?tagIds=${admin.id}`);
    expect(byTags.items.every((task) => task.tagIds.includes(admin.id))).toBe(true);

    const noDate = await list(`?due=NONE`);
    expect(noDate.items.every((task) => task.dueDate === undefined)).toBe(true);

    const sorted = await list(`?sort=TITLE&limit=100`);
    const titles = sorted.items.map((task) => task.title);
    expect([...titles].sort((left, right) => left.localeCompare(right, "fr"))).toEqual(titles);
  });

  it("refuse un tag inconnu", async () => {
    const result = await request("/api/v1/tasks", {
      method: "POST",
      body: {
        title: "tag fantôme",
        tagIds: ["018f3b3c-1a2b-7c3d-8e4f-ffffffffffff"],
      },
    });
    expect(result.status).toBe(400);
    expect(problemDetailsSchema.parse(result.body).messageKey).toBe("task.tag_not_found");
  });
});

describe("RF-22/23 — sous-tâches et complétion", () => {
  it("hérite du projet, refuse une échéance et se supprime avec le parent", async () => {
    const project = await createProject("Projet sous-tâches");
    const parent = await createTask({ title: "Parent", projectId: project.id });
    const child = await createTask({ title: "Enfant", parentId: parent.id });

    expect(child.parentId).toBe(parent.id);
    expect(child.projectId).toBe(project.id);

    const withDueDate = await request("/api/v1/tasks", {
      method: "POST",
      body: { title: "Enfant daté", parentId: parent.id, dueDate: "2026-12-01" },
    });
    expect(withDueDate.status).toBe(400);
    expect(problemDetailsSchema.parse(withDueDate.body).messageKey).toBe("task.subtask_due_date");

    const removed = await request(`/api/v1/tasks/${parent.id}?version=${parent.version}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);
    expect((await request(`/api/v1/tasks/${child.id}`)).status).toBe(404);

    const restored = await request(`/api/v1/tasks/${parent.id}/restore`, { method: "POST" });
    expect(restored.status).toBe(200);
    expect((await request(`/api/v1/tasks/${child.id}`)).status).toBe(200);
  });

  it("masque les tâches terminées par défaut et permet de les rouvrir", async () => {
    const task = await createTask({ title: "À terminer" });
    const done = await request(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      body: { status: "DONE", version: task.version },
    });
    const completed = taskSchema.parse(done.body);
    expect(completed.completedAt).not.toBeNull();

    expect((await list(`?q=${encodeURIComponent("À terminer")}`)).items).toHaveLength(0);
    expect(
      (await list(`?q=${encodeURIComponent("À terminer")}&includeCompleted=true`)).items,
    ).toHaveLength(1);

    const reopened = await request(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      body: { status: "TODO", version: completed.version },
    });
    expect(taskSchema.parse(reopened.body).completedAt).toBeNull();
  });
});

describe("RF-11/12 — Inbox, ordre et tri", () => {
  it("vide l'Inbox vers un projet et persiste l'ordre manuel", async () => {
    const project = await createProject("Projet Inbox");
    const first = await createTask({ title: "Inbox A" });
    const second = await createTask({ title: "Inbox B" });

    const emptied = await request("/api/v1/tasks/inbox/empty", {
      method: "POST",
      body: { projectId: project.id },
    });
    expect(emptied.status).toBe(200);
    expect((emptied.body as { moved: number }).moved).toBeGreaterThanOrEqual(2);

    const inProject = await list(`?projectId=${project.id}&limit=100`);
    expect(inProject.items.map((task) => task.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );

    const ordered = await request("/api/v1/tasks/order", {
      method: "PATCH",
      body: { ids: [second.id, first.id] },
    });
    expect(ordered.status).toBe(200);
    const order = await list(`?projectId=${project.id}&limit=100`);
    const ids = order.items.map((task) => task.id);
    expect(ids.indexOf(second.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });

  it("réordonne les projets", async () => {
    const first = await createProject("Ordre A");
    const second = await createProject("Ordre B");
    const result = await request("/api/v1/projects/order", {
      method: "PATCH",
      body: { ids: [second.id, first.id] },
    });
    expect(result.status).toBe(200);

    const projects = (await request("/api/v1/projects")).body as { items: unknown[] };
    const parsed = projects.items.map((project) => projectSchema.parse(project));
    const indexes = [parsed.findIndex((p) => p.id === second.id), parsed.findIndex((p) => p.id === first.id)];
    expect(indexes[0]).toBeLessThan(indexes[1] ?? Number.MAX_SAFE_INTEGER);
  });

  it("refuse d'ajouter une tâche à un projet archivé", async () => {
    const project = await createProject("Projet archivé");
    const archived = await request(`/api/v1/projects/${project.id}`, {
      method: "PATCH",
      body: { archived: true, version: project.version },
    });
    expect(archived.status).toBe(200);

    const result = await request("/api/v1/tasks", {
      method: "POST",
      body: { title: "Trop tard", projectId: project.id },
    });
    expect(result.status).toBe(409);
    expect(problemDetailsSchema.parse(result.body).messageKey).toBe("task.project_archived");
  });
});

describe("RF-28/29 — récurrence et corbeille", () => {
  it("crée l'occurrence suivante en date fixe et l'envoie dans la corbeille", async () => {
    const task = await createTask({
      title: "Réviser chaque lundi",
      dueDate: "2026-11-30",
      recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=MO",
    });

    const done = await request(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      body: { status: "DONE", version: task.version },
    });
    expect(done.status).toBe(200);

    const all = await list("?includeCompleted=true&limit=100");
    const next = all.items.find(
      (item) => item.title === task.title && item.status === "TODO" && item.id !== task.id,
    );
    expect(next?.dueDate).toBe("2026-12-07");

    const removed = await request(`/api/v1/tasks/${task.id}?version=${task.version + 1}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);
    const trash = (await request("/api/v1/tasks/trash")).body as {
      tasks: readonly { id: string }[];
    };
    expect(trash.tasks.some((item) => item.id === task.id)).toBe(true);

    const restore = await request(`/api/v1/tasks/${task.id}/restore`, { method: "POST" });
    expect(restore.status).toBe(200);
    expect((await request(`/api/v1/tasks/${task.id}`)).status).toBe(200);
  });
});

describe("RF-26/27 — gestion des tags", () => {
  it("crée, renomme, déduplique et supprime un tag en nettoyant les tâches", async () => {
    const createdResult = await request("/api/v1/tags", {
      method: "POST",
      body: { name: "Courses", color: "blue" },
    });
    expect(createdResult.status).toBe(201);
    const created = tagSchema.parse(createdResult.body);

    const duplicate = await request("/api/v1/tags", {
      method: "POST",
      body: { name: " courses " },
    });
    expect(duplicate.status).toBe(409);
    expect(problemDetailsSchema.parse(duplicate.body).messageKey).toBe("tag.name_taken");

    const renamed = await request(`/api/v1/tags/${created.id}`, {
      method: "PATCH",
      body: { name: "Achats" },
    });
    expect(renamed.status).toBe(200);
    expect(tagSchema.parse(renamed.body).name).toBe("Achats");

    const ensured = await request("/api/v1/tags/ensure", {
      method: "POST",
      body: { names: ["achats"] },
    });
    expect(ensured.status).toBe(200);
    expect(tagSchema.parse((ensured.body as unknown[])[0]).id).toBe(created.id);

    const task = await createTask({ title: "Liste de courses", tagIds: [created.id] });
    const removed = await request(`/api/v1/tags/${created.id}`, { method: "DELETE" });
    expect(removed.status).toBe(204);

    const refreshed = await request(`/api/v1/tasks/${task.id}`);
    expect(taskSchema.parse(refreshed.body).tagIds).not.toContain(created.id);
  });
});

describe("RF-12/28 — tris alternatifs et récurrence après complétion", () => {
  it("trie par priorité décroissante", async () => {
    await createTask({ title: "Tri-priorite basse", priority: "LOW" });
    await createTask({ title: "Tri-priorite haute", priority: "HIGH" });
    await createTask({ title: "Tri-priorite urgente", priority: "URGENT" });

    const sorted = await list("?q=Tri-priorite&sort=PRIORITY&limit=100");
    expect(sorted.items.map((task) => task.priority)).toEqual(["URGENT", "HIGH", "LOW"]);
  });

  it("calcule l'occurrence suivante depuis la date de complétion", async () => {
    const task = await createTask({
      title: "Récurrence après complétion",
      dueDate: "2026-11-30",
      recurrenceRule: "RRULE:FREQ=DAILY",
      recurrenceMode: "AFTER_COMPLETION",
    });

    const done = await request(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      body: { status: "DONE", version: task.version },
    });
    const completed = taskSchema.parse(done.body);
    expect(completed.completedAt).not.toBeNull();

    const all = await list("?includeCompleted=true&limit=100");
    const next = all.items.find(
      (item) =>
        item.title === task.title && item.status === "TODO" && item.id !== task.id,
    );
    expect(next?.recurrenceMode).toBe("AFTER_COMPLETION");
    expect(next?.dueDate).not.toBe("2026-11-30");
    expect((next?.dueDate ?? "").localeCompare((completed.completedAt ?? "").slice(0, 10))).toBe(1);
  });
});
