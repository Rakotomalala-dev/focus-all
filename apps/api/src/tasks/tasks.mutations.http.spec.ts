import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  problemDetailsSchema,
  taskListResponseSchema,
  taskSchema,
  type Task,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";

// Même approche que tasks.http.spec.ts : vraie application Nest + Fastify,
// réponses validées par les schémas du contrat. Chaque test crée sa propre
// tâche pour ne dépendre d'aucun état laissé par un autre.
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

async function createTask(payload: unknown = { title: "tâche de test" }): Promise<Task> {
  const result = await request("/api/v1/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return taskSchema.parse(result.body);
}

function patch(id: string, payload: unknown, ifMatch?: string): Promise<HttpResult> {
  return request(`/api/v1/tasks/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(ifMatch === undefined ? {} : { "if-match": ifMatch }),
    },
    body: JSON.stringify(payload),
  });
}

function remove(id: string, version?: number, ifMatch?: string): Promise<HttpResult> {
  const query = version === undefined ? "" : `?version=${version}`;
  return request(`/api/v1/tasks/${id}${query}`, {
    method: "DELETE",
    ...(ifMatch === undefined ? {} : { headers: { "if-match": ifMatch } }),
  });
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

describe("PATCH /api/v1/tasks/:id", () => {
  it("modifie les champs fournis et incrémente la version", async () => {
    const created = await createTask({ title: "avant" });

    const result = await patch(created.id, { title: "après", priority: "URGENT", version: 0 });

    expect(result.status).toBe(200);
    const updated = taskSchema.parse(result.body);
    expect(updated.title).toBe("après");
    expect(updated.priority).toBe("URGENT");
    expect(updated.version).toBe(1);
    // Un champ non fourni reste inchangé (PATCH partiel).
    expect(updated.status).toBe("TODO");
  });

  it("horodate completedAt en passant à DONE, et l'efface en revenant en arrière", async () => {
    const created = await createTask();

    const done = taskSchema.parse((await patch(created.id, { status: "DONE", version: 0 })).body);
    expect(done.completedAt).not.toBeNull();
    expect(done.status).toBe("DONE");

    const reopened = taskSchema.parse(
      (await patch(created.id, { status: "TODO", version: 1 })).body,
    );
    expect(reopened.completedAt).toBeNull();
    expect(reopened.version).toBe(2);
  });

  it("refuse une version obsolète en 409 CONFLICT_VERSION", async () => {
    const created = await createTask();
    await patch(created.id, { title: "première modification", version: 0 });

    const result = await patch(created.id, { title: "seconde modification", version: 0 });

    expect(result.status).toBe(409);
    expect(result.contentType).toContain("application/problem+json");
    expect(problemDetailsSchema.parse(result.body).code).toBe("CONFLICT_VERSION");
  });

  it("accepte la version via If-Match quand le corps n'en porte pas", async () => {
    const created = await createTask();

    const result = await patch(created.id, { title: "via if-match" }, 'W/"0"');

    expect(result.status).toBe(200);
    expect(taskSchema.parse(result.body).title).toBe("via if-match");
  });

  it("refuse une requête sans version en 400 VALIDATION_FAILED", async () => {
    const created = await createTask();

    const result = await patch(created.id, { title: "sans version" });

    expect(result.status).toBe(400);
    expect(problemDetailsSchema.parse(result.body).code).toBe("VALIDATION_FAILED");
  });

  it("refuse un corps vide et un champ invalide en 400", async () => {
    const created = await createTask();

    const empty = await patch(created.id, { version: 0 });
    const invalid = await patch(created.id, { priority: "CRITICAL", version: 0 });

    expect(empty.status).toBe(400);
    expect(problemDetailsSchema.parse(empty.body).code).toBe("VALIDATION_FAILED");
    expect(invalid.status).toBe(400);
  });

  it("renvoie 404 pour un identifiant inconnu et 400 pour un id non UUID", async () => {
    const unknown = await patch("018f3b3c-1a2b-7c3d-8e4f-ffffffffffff", { title: "x", version: 0 });
    const malformed = await patch("42", { title: "x", version: 0 });

    expect(unknown.status).toBe(404);
    expect(problemDetailsSchema.parse(unknown.body).code).toBe("NOT_FOUND");
    expect(malformed.status).toBe(400);
  });
});

describe("DELETE /api/v1/tasks/:id", () => {
  it("supprime la tâche et renvoie 204 sans corps", async () => {
    const created = await createTask({ title: "à supprimer" });

    const result = await remove(created.id, 0);

    expect(result.status).toBe(204);
    expect(result.body).toBeNull();

    const afterDelete = await request(`/api/v1/tasks/${created.id}`);
    expect(afterDelete.status).toBe(404);

    const list = taskListResponseSchema.parse((await request("/api/v1/tasks?limit=100")).body);
    expect(list.items.some((task) => task.id === created.id)).toBe(false);
  });

  it("accepte la version via If-Match quand la query n'en porte pas", async () => {
    const created = await createTask();

    const result = await remove(created.id, undefined, '"0"');

    expect(result.status).toBe(204);
    expect((await request(`/api/v1/tasks/${created.id}`)).status).toBe(404);
  });

  it("refuse une version obsolète en 409 CONFLICT_VERSION et conserve la tâche", async () => {
    const created = await createTask();
    await patch(created.id, { title: "modifiée", version: 0 });

    const result = await remove(created.id, 0);

    expect(result.status).toBe(409);
    expect(problemDetailsSchema.parse(result.body).code).toBe("CONFLICT_VERSION");
    expect((await request(`/api/v1/tasks/${created.id}`)).status).toBe(200);
  });

  it("refuse une requête sans version en 400 et un id non UUID en 400", async () => {
    const created = await createTask();

    const noVersion = await remove(created.id);
    const malformed = await remove("42", 0);

    expect(noVersion.status).toBe(400);
    expect(problemDetailsSchema.parse(noVersion.body).code).toBe("VALIDATION_FAILED");
    expect(malformed.status).toBe(400);
  });

  it("renvoie 404 pour un identifiant inconnu", async () => {
    const result = await remove("018f3b3c-1a2b-7c3d-8e4f-ffffffffffff", 3);

    expect(result.status).toBe(404);
    expect(problemDetailsSchema.parse(result.body).code).toBe("NOT_FOUND");
  });

  it("refuse un If-Match non numérique en 400", async () => {
    const created = await createTask();

    const result = await remove(created.id, undefined, 'W/"abc"');

    expect(result.status).toBe(400);
    expect(problemDetailsSchema.parse(result.body).code).toBe("VALIDATION_FAILED");
  });
});
