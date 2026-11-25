import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "../auth/auth-context";
import { DomainError } from "../common/domain-error";
import { InMemoryTaskRepository } from "./task.repository";
import { TasksService } from "./tasks.service";

const CONTEXT: AuthContext = {
  userId: "018f3b3c-1a2b-7c3d-8e4f-444444444444",
  workspaceId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
};

function createService(): TasksService {
  return new TasksService(new InMemoryTaskRepository());
}

describe("TasksService.create", () => {
  it("applique les valeurs par défaut et renvoie l'entité créée", async () => {
    const task = await createService().create(CONTEXT, { title: "  Écrire les tests  " });

    expect(task.title).toBe("Écrire les tests");
    expect(task.priority).toBe("NONE");
    expect(task.status).toBe("TODO");
    expect(task.version).toBe(0);
    expect(task.completedAt).toBeNull();
    expect(task.tagIds).toEqual([]);
  });

  it("refuse un corps invalide", async () => {
    // Le contenu du `detail` (une ligne par champ fautif) est vérifié au niveau
    // HTTP, dans tasks.http.spec.ts, à travers le filtre problem+json.
    await expect(createService().create(CONTEXT, { title: "" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      createService().create(CONTEXT, { title: "", priority: "CRITICAL" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse un identifiant de projet qui n'est pas un UUID", async () => {
    await expect(createService().create(CONTEXT, { title: "T", projectId: "42" })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe("TasksService.list", () => {
  it("renvoie une liste vide avec nextCursor à null (état vide)", async () => {
    await expect(createService().list(CONTEXT, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("pagine par curseur sans offset exposé", async () => {
    const service = createService();
    for (const title of ["un", "deux", "trois"]) {
      await service.create(CONTEXT, { title });
    }

    const first = await service.list(CONTEXT, { limit: "2" });
    expect(first.items.map((task) => task.title)).toEqual(["un", "deux"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.list(CONTEXT, {
      limit: "2",
      cursor: first.nextCursor ?? "",
    });
    expect(second.items.map((task) => task.title)).toEqual(["trois"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filtre par statut et refuse une limite hors bornes", async () => {
    const service = createService();
    await service.create(CONTEXT, { title: "un" });

    await expect(service.list(CONTEXT, { status: "DONE" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(service.list(CONTEXT, { limit: "0" })).rejects.toThrow(BadRequestException);
  });

  it("refuse un curseur illisible ou de forme inattendue", async () => {
    const service = createService();
    const base64 = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
    const invalidCursor = { messageKey: "request.invalid_cursor", status: 400 };

    await expect(service.list(CONTEXT, { cursor: "bof" })).rejects.toMatchObject(invalidCursor);
    // JSON valide mais clé de tri incomplète, puis id non UUID.
    await expect(
      service.list(CONTEXT, { cursor: base64('{"sortOrder":"000001"}') }),
    ).rejects.toMatchObject(invalidCursor);
    await expect(
      service.list(CONTEXT, { cursor: base64('{"sortOrder":"000001","id":"42"}') }),
    ).rejects.toMatchObject(invalidCursor);
  });

  it("utilise la clé de tri de la dernière tâche comme curseur", async () => {
    const service = createService();
    await service.create(CONTEXT, { title: "un" });
    await service.create(CONTEXT, { title: "deux" });

    const first = await service.list(CONTEXT, { limit: "1" });
    const cursor = first.nextCursor ?? "";
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));

    // Le curseur expose (sortOrder, id) de la dernière tâche, pas un rang.
    expect(decoded).toMatchObject({
      sortOrder: first.items[0]?.sortOrder,
      id: first.items[0]?.id,
    });
  });
});

describe("TasksService.findById", () => {
  it("renvoie la tâche créée", async () => {
    const service = createService();
    const created = await service.create(CONTEXT, { title: "un" });

    await expect(service.findById(CONTEXT, created.id)).resolves.toEqual(created);
  });

  it("renvoie 404 pour un UUID inconnu et 400 pour un identifiant invalide", async () => {
    const service = createService();

    await expect(
      service.findById(CONTEXT, "018f3b3c-1a2b-7c3d-8e4f-ffffffffffff"),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      service.findById(CONTEXT, "018f3b3c-1a2b-7c3d-8e4f-ffffffffffff"),
    ).rejects.toMatchObject({
      messageKey: "task.not_found",
      status: 404,
    });
    await expect(service.findById(CONTEXT, "42")).rejects.toMatchObject({
      messageKey: "request.invalid_field",
    });
  });
});
