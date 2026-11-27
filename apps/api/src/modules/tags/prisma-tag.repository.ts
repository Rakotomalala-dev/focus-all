import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Tag, TagDraft } from "@focus/contracts";
import { uuidV7 } from "../../common/uuid-v7";
import { PrismaService } from "../../database/prisma.service";
import { normalizeTagName, toTag } from "./tag.mapper";
import type { TagPatch, TagRepository } from "./tag.repository";

@Injectable()
export class PrismaTagRepository implements TagRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(draft: TagDraft, workspaceId: string): Promise<Tag> {
    const row = await this.prisma.tag.create({
      data: {
        id: uuidV7(),
        workspaceId,
        name: draft.name,
        nameNormalized: normalizeTagName(draft.name),
        ...(draft.color === undefined ? {} : { color: draft.color }),
      },
    });
    return toTag(row);
  }

  async list(workspaceId: string): Promise<readonly Tag[]> {
    const rows = await this.prisma.tag.findMany({
      where: { workspaceId },
      orderBy: [{ nameNormalized: "asc" }, { id: "asc" }],
    });
    return rows.map(toTag);
  }

  async findByIds(ids: readonly string[], workspaceId: string): Promise<readonly Tag[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.tag.findMany({
      where: { workspaceId, id: { in: [...ids] } },
    });
    return rows.map(toTag);
  }

  async ensure(names: readonly string[], workspaceId: string): Promise<readonly Tag[]> {
    const normalized = [...new Set(names.map(normalizeTagName))];
    return this.prisma.$transaction(async (tx) => {
      const tags: Tag[] = [];
      for (const name of normalized) {
        const row = await tx.tag.upsert({
          where: { workspaceId_nameNormalized: { workspaceId, nameNormalized: name } },
          create: {
            id: uuidV7(),
            workspaceId,
            name: name.slice(0, 40),
            nameNormalized: name.slice(0, 40),
          },
          update: {},
        });
        tags.push(toTag(row));
      }
      return tags;
    });
  }

  async update(
    id: string,
    workspaceId: string,
    patch: TagPatch,
  ): Promise<Tag | "not_found" | "name_taken"> {
    try {
      const updated = await this.prisma.tag.updateMany({
        where: { id, workspaceId },
        data: {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.nameNormalized === undefined
            ? {}
            : { nameNormalized: patch.nameNormalized }),
          ...(patch.color === undefined ? {} : { color: patch.color }),
        },
      });
      if (updated.count === 0) {
        return "not_found";
      }
      const row = await this.prisma.tag.findUniqueOrThrow({ where: { id } });
      return toTag(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return "name_taken";
      }
      throw error;
    }
  }

  async remove(id: string, workspaceId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.tag.deleteMany({ where: { id, workspaceId } });
      if (deleted.count === 0) {
        return false;
      }
      // `Task.tagIds` est un tableau sans clé étrangère : supprimer le tag doit
      // aussi retirer ses références, sinon les tâches exposent un identifiant
      // orphelin et l'UI affiche un tag fantôme.
      await tx.$executeRaw`
        UPDATE "Task"
        SET "tagIds" = array_remove("tagIds", ${id}::uuid)
        WHERE "workspaceId" = ${workspaceId}::uuid
          AND ${id}::uuid = ANY("tagIds")
      `;
      return true;
    });
  }
}
