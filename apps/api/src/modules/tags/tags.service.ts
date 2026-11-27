import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  MAX_TAGS_PER_WORKSPACE,
  tagDraftSchema,
  tagEnsureSchema,
  tagUpdateSchema,
  uuidSchema,
  type Tag,
  type TagListResponse,
} from "@focus/contracts";
import { DomainError } from "../../common/domain-error";
import { describeIssues } from "../../common/zod-issues";
import type { AuthContext } from "../auth/auth-context";
import { normalizeTagName } from "./tag.mapper";
import { TAG_REPOSITORY, type TagPatch, type TagRepository } from "./tag.repository";

@Injectable()
export class TagsService {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  async list(auth: AuthContext): Promise<TagListResponse> {
    const items = await this.tags.list(auth.workspaceId);
    return { items: [...items], nextCursor: null };
  }

  async create(auth: AuthContext, rawBody: unknown): Promise<Tag> {
    const parsed = tagDraftSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const count = (await this.tags.list(auth.workspaceId)).length;
    if (count >= MAX_TAGS_PER_WORKSPACE) {
      throw new DomainError("tag.limit_reached");
    }
    try {
      return await this.tags.create(parsed.data, auth.workspaceId);
    } catch {
      throw new DomainError("tag.name_taken");
    }
  }

  async ensure(auth: AuthContext, rawBody: unknown): Promise<readonly Tag[]> {
    const parsed = tagEnsureSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const count = (await this.tags.list(auth.workspaceId)).length;
    if (count + parsed.data.names.length > MAX_TAGS_PER_WORKSPACE) {
      throw new DomainError("tag.limit_reached");
    }
    return this.tags.ensure(parsed.data.names, auth.workspaceId);
  }

  async update(auth: AuthContext, rawId: string, rawBody: unknown): Promise<Tag> {
    const id = this.parseId(rawId);
    const parsed = tagUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }
    const patch: TagPatch = {
      ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
      ...(parsed.data.name === undefined
        ? {}
        : { nameNormalized: normalizeTagName(parsed.data.name) }),
      ...(parsed.data.color === undefined ? {} : { color: parsed.data.color }),
    };
    const result = await this.tags.update(id, auth.workspaceId, patch);
    if (result === "not_found") {
      throw new DomainError("tag.not_found");
    }
    if (result === "name_taken") {
      throw new DomainError("tag.name_taken");
    }
    return result;
  }

  async remove(auth: AuthContext, rawId: string): Promise<void> {
    const removed = await this.tags.remove(this.parseId(rawId), auth.workspaceId);
    if (!removed) {
      throw new DomainError("tag.not_found");
    }
  }

  async validateIds(auth: AuthContext, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const found = await this.tags.findByIds(ids, auth.workspaceId);
    if (found.length !== new Set(ids).size) {
      throw new DomainError("task.tag_not_found");
    }
  }

  private parseId(rawId: string): string {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) {
      throw new DomainError("request.invalid_field", { field: "id" });
    }
    return parsed.data;
  }
}
