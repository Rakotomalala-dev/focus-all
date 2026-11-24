import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { InMemoryTaskRepository } from "./task.repository";
import { TasksService } from "./tasks.service";

function createService(): TasksService {
  return new TasksService(new InMemoryTaskRepository());
}

describe("TasksService.create", () => {
  it("applique les valeurs par défaut et renvoie l'entité créée", async () => {
    const task = await createService().create({ title: "  Écrire les tests  " });

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
    await expect(createService().create({ title: "" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      createService().create({ title: "", priority: "CRITICAL" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse un identifiant de projet qui n'est pas un UUID", async () => {
    await expect(createService().create({ title: "T", projectId: "42" })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe("TasksService.list", () => {
  it("renvoie une liste vide avec nextCursor à null (état vide)", async () => {
    await expect(createService().list({})).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("pagine par curseur sans offset exposé", async () => {
    const service = createService();
    for (const title of ["un", "deux", "trois"]) {
      await service.create({ title });
    }

    const first = await service.list({ limit: "2" });
    expect(first.items.map((task) => task.title)).toEqual(["un", "deux"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.list({ limit: "2", cursor: first.nextCursor ?? "" });
    expect(second.items.map((task) => task.title)).toEqual(["trois"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filtre par statut et refuse une limite hors bornes", async () => {
    const service = createService();
    await service.create({ title: "un" });

    await expect(service.list({ status: "DONE" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(service.list({ limit: "0" })).rejects.toThrow(BadRequestException);
  });

  it("refuse un curseur illisible ou de forme inattendue", async () => {
    const service = createService();
    const base64 = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

    await expect(service.list({ cursor: "bof" })).rejects.toThrow(BadRequestException);
    // JSON valide mais clé de tri incomplète, puis id non UUID.
    await expect(service.list({ cursor: base64('{"sortOrder":"000001"}') })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.list({ cursor: base64('{"sortOrder":"000001","id":"42"}') }),
    ).rejects.toThrow(BadRequestException);
  });

  it("utilise la clé de tri de la dernière tâche comme curseur", async () => {
    const service = createService();
    await service.create({ title: "un" });
    await service.create({ title: "deux" });

    const first = await service.list({ limit: "1" });
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
    const created = await service.create({ title: "un" });

    await expect(service.findById(created.id)).resolves.toEqual(created);
  });

  it("renvoie 404 pour un UUID inconnu et 400 pour un identifiant invalide", async () => {
    const service = createService();

    await expect(service.findById("018f3b3c-1a2b-7c3d-8e4f-ffffffffffff")).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.findById("42")).rejects.toThrow(BadRequestException);
  });
});
