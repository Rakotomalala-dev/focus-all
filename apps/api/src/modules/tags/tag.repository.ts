import type { Tag, TagDraft } from "@focus/contracts";

export type TagPatch = {
  readonly name?: string;
  readonly nameNormalized?: string;
  readonly color?: string | null;
};

export interface TagRepository {
  create(draft: TagDraft, workspaceId: string): Promise<Tag>;
  list(workspaceId: string): Promise<readonly Tag[]>;
  findByIds(ids: readonly string[], workspaceId: string): Promise<readonly Tag[]>;
  ensure(names: readonly string[], workspaceId: string): Promise<readonly Tag[]>;
  update(
    id: string,
    workspaceId: string,
    patch: TagPatch,
  ): Promise<Tag | "not_found" | "name_taken">;
  remove(id: string, workspaceId: string): Promise<boolean>;
}

export const TAG_REPOSITORY = "TAG_REPOSITORY";
