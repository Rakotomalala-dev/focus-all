import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  problemDetailsSchema,
  taskListResponseSchema,
  taskSchema,
  type TaskListResponse,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";

// Test d'intégration HTTP : la vraie application Nest + Fastify, sans mock du
// filtre. Les cas sont ordonnés (vide -> contenu -> erreurs, puis pagination),
// l'application et son repository en mémoire étant partagés par le fichier.
let app: NestFastifyApplication;
let baseUrl = "";

type HttpResult = {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: unknown;
};

async function request(path: string, init?: RequestInit): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    body = JSON.parse(text);
  }
  return { status: response.status, contentType: response.headers.get("content-type"), body };
}

function postTask(payload: unknown): Promise<HttpResult> {
  return request("/api/v1/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Valider le corps par le contrat vaut mieux qu'un cast : si la réponse dérive,
// le test échoue sur le schéma et non sur un accès de propriété.
function parseList(body: unknown): TaskListResponse {
  return taskListResponseSchema.parse(body);
}

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
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
    const result = await request("/api/v1/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ pas du json",
    });

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
  it("renvoie un nextCursor puis termine la liste", async () => {
    await postTask({ title: "deuxième" });
    await postTask({ title: "troisième" });

    const first = await request("/api/v1/tasks?limit=2");
    const firstPage = parseList(first.body);

    expect(first.status).toBe(200);
    expect(firstPage.items).toHaveLength(2);
    expect(typeof firstPage.nextCursor).toBe("string");

    const cursor = firstPage.nextCursor ?? "";
    const second = await request(`/api/v1/tasks?limit=2&cursor=${encodeURIComponent(cursor)}`);
    const secondPage = parseList(second.body);

    // 4 tâches existent à ce stade : deux pages de 2, la seconde terminant la
    // liste. Les identifiants ne doivent pas se répéter d'une page à l'autre.
    expect(second.status).toBe(200);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.nextCursor).toBeNull();

    const firstIds = new Set(firstPage.items.map((task) => task.id));
    expect(secondPage.items.some((task) => firstIds.has(task.id))).toBe(false);
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
