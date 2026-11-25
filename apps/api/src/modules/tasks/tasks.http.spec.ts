import {
  problemDetailsSchema,
  taskListResponseSchema,
  taskSchema,
  type TaskListResponse,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestApi,
  TEST_USER_ID,
  TEST_WORKSPACE_ID,
  type HttpResult,
  type RequestOptions,
  type TestApi,
} from "../../../test/helpers/test-api";

// Test d'intégration HTTP : la vraie application Nest + Fastify, sans mock du
// filtre. Les cas sont ordonnés (vide -> contenu -> erreurs, puis pagination),
// l'application et son repository en mémoire étant partagés par le fichier.
// Chaque requête porte un vrai jeton : aucun test ne contourne le guard.
let api: TestApi;
let authorization = "";

function request(
  path: string,
  options?: Omit<RequestOptions, "authorization">,
): Promise<HttpResult> {
  return api.request(path, { ...options, authorization });
}

function postTask(payload: unknown): Promise<HttpResult> {
  return request("/api/v1/tasks", { method: "POST", body: payload });
}

// Valider le corps par le contrat vaut mieux qu'un cast : si la réponse dérive,
// le test échoue sur le schéma et non sur un accès de propriété.
function parseList(body: unknown): TaskListResponse {
  return taskListResponseSchema.parse(body);
}

beforeAll(async () => {
  api = await startTestApi();
  authorization = await api.bearerToken({
    userId: TEST_USER_ID,
    workspaceId: TEST_WORKSPACE_ID,
  });
});

afterAll(async () => {
  await api.close();
});

describe("état vide", () => {
  it("GET /api/v1/tasks renvoie 200 avec items vides et nextCursor null", async () => {
    const result = await request("/api/v1/tasks");

    expect(result.status).toBe(200);
    expect(parseList(result.body)).toEqual({ items: [], nextCursor: null });
  });
});

describe("état contenu", () => {
  it("POST crée la tâche, applique les défauts et rogne le titre", async () => {
    const result = await postTask({ title: "  Première tâche  " });

    expect(result.status).toBe(201);
    const task = taskSchema.parse(result.body);
    expect(task.title).toBe("Première tâche");
    expect(task.status).toBe("TODO");
    expect(task.priority).toBe("NONE");
    expect(task.version).toBe(0);
    expect(task.completedAt).toBeNull();
    expect(task.tagIds).toEqual([]);
  });

  it("GET renvoie la tâche créée dans une liste conforme au contrat", async () => {
    const result = await request("/api/v1/tasks");
    const page = parseList(result.body);

    expect(result.status).toBe(200);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe("Première tâche");
    expect(page.nextCursor).toBeNull();
  });

  it("GET /:id renvoie la tâche demandée", async () => {
    const created = taskSchema.parse((await postTask({ title: "à lire" })).body);

    const result = await request(`/api/v1/tasks/${created.id}`);

    expect(result.status).toBe(200);
    expect(taskSchema.parse(result.body).id).toBe(created.id);
  });

  it("POST renvoie Location et un ETag égal à la version", async () => {
    const result = await postTask({ title: "avec en-têtes" });
    const task = taskSchema.parse(result.body);

    expect(result.headers.get("location")).toBe(`/api/v1/tasks/${task.id}`);
    expect(result.headers.get("etag")).toBe('"0"');
  });

  it("GET /:id publie la version en ETag, réutilisable telle quelle dans If-Match", async () => {
    const created = taskSchema.parse((await postTask({ title: "etag" })).body);

    const read = await request(`/api/v1/tasks/${created.id}`);
    const etag = read.headers.get("etag");

    expect(etag).toBe(`"${created.version}"`);

    // La valeur de l'ETag, rejouée en If-Match, doit être acceptée.
    const patched = await request(`/api/v1/tasks/${created.id}`, {
      method: "PATCH",
      headers: { "if-match": etag ?? "" },
      body: { title: "via etag" },
    });

    expect(patched.status).toBe(200);
    expect(taskSchema.parse(patched.body).version).toBe(created.version + 1);
    expect(patched.headers.get("etag")).toBe(`"${created.version + 1}"`);
  });
});

describe("état erreur", () => {
  it("POST invalide : 400 application/problem+json, code VALIDATION_FAILED", async () => {
    const result = await postTask({ title: "", priority: "CRITICAL" });

    expect(result.status).toBe(400);
    expect(result.contentType).toContain("application/problem+json");

    const problem = problemDetailsSchema.parse(result.body);
    expect(problem.code).toBe("VALIDATION_FAILED");
    expect(problem.instance).toBe("/api/v1/tasks");
    expect(problem.detail).toContain("title");
  });

  it("POST avec un corps non JSON : 400 problem+json, jamais une trace serveur", async () => {
    const result = await request("/api/v1/tasks", { method: "POST", rawBody: "{ pas du json" });

    expect(result.status).toBe(400);
    expect(result.contentType).toContain("application/problem+json");
  });

  it("GET /:id inconnu : 404 problem+json avec NOT_FOUND", async () => {
    const result = await request("/api/v1/tasks/018f3b3c-1a2b-7c3d-8e4f-ffffffffffff");

    expect(result.status).toBe(404);
    expect(result.contentType).toContain("application/problem+json");
    expect(problemDetailsSchema.parse(result.body).code).toBe("NOT_FOUND");
  });

  it("GET /:id non UUID : 400 problem+json avec VALIDATION_FAILED", async () => {
    const result = await request("/api/v1/tasks/42");

    expect(result.status).toBe(400);
    expect(problemDetailsSchema.parse(result.body).code).toBe("VALIDATION_FAILED");
  });
});

describe("pagination par curseur", () => {
  it("parcourt toute la liste par pages, sans doublon ni oubli", async () => {
    await postTask({ title: "deuxième" });
    await postTask({ title: "troisième" });

    // Référence : la liste complète en une page. Le nombre de tâches créées par
    // les autres cas du fichier peut varier, donc on ne le code pas en dur.
    const all = parseList((await request("/api/v1/tasks?limit=100")).body);
    expect(all.nextCursor).toBeNull();
    expect(all.items.length).toBeGreaterThanOrEqual(4);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const query = cursor === null ? "?limit=2" : `?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const result = await request(`/api/v1/tasks${query}`);
      const parsed = parseList(result.body);

      expect(result.status).toBe(200);
      expect(parsed.items.length).toBeGreaterThan(0);
      seen.push(...parsed.items.map((task) => task.id));
      cursor = parsed.nextCursor;
      if (cursor === null) {
        break;
      }
    }

    expect(cursor).toBeNull();
    // Aucun doublon, puis exactement la même collection que la référence.
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual(all.items.map((task) => task.id).sort());
  });

  it("garde le curseur valide quand une tâche est créée entre deux pages", async () => {
    const firstPage = parseList((await request("/api/v1/tasks?limit=2")).body);
    const cursor = firstPage.nextCursor ?? "";
    expect(cursor).not.toBe("");

    const created = taskSchema.parse((await postTask({ title: "arrivée après la page 1" })).body);
    const secondPage = parseList(
      (await request(`/api/v1/tasks?limit=2&cursor=${encodeURIComponent(cursor)}`)).body,
    );

    const firstIds = new Set(firstPage.items.map((item) => item.id));
    // Aucune répétition d'une tâche déjà vue : le curseur repart de la clé de
    // tri, pas d'un rang que l'insertion aurait décalé.
    expect(secondPage.items.some((item) => firstIds.has(item.id))).toBe(false);

    // Et la tâche créée reste atteignable depuis le même curseur.
    const reachable = parseList(
      (await request(`/api/v1/tasks?limit=10&cursor=${encodeURIComponent(cursor)}`)).body,
    );
    expect(reachable.items.map((item) => item.id)).toContain(created.id);
  });

  it("refuse un curseur forgé en 400", async () => {
    const result = await request("/api/v1/tasks?cursor=bof");

    expect(result.status).toBe(400);
    expect(problemDetailsSchema.parse(result.body).code).toBe("VALIDATION_FAILED");
  });

  it("refuse une limite hors bornes en 400", async () => {
    const result = await request("/api/v1/tasks?limit=0");

    expect(result.status).toBe(400);
    expect(problemDetailsSchema.parse(result.body).code).toBe("VALIDATION_FAILED");
  });
});
