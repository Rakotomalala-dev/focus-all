import {
  tagDraftSchema,
  tagEnsureSchema,
  tagListResponseSchema,
  tagSchema,
  tagUpdateSchema,
  type Tag,
  type TagDraftInput,
  type TagUpdate,
} from "@focus/contracts";
import type { HttpClient } from "../http/client";

export const TAGS_PATH = "/tags";

export type TagRepository = {
  readonly list: () => Promise<readonly Tag[]>;
  readonly create: (draft: TagDraftInput) => Promise<Tag>;
  readonly update: (id: string, patch: TagUpdate) => Promise<Tag>;
  readonly delete: (id: string) => Promise<void>;
  readonly ensure: (names: readonly string[]) => Promise<readonly Tag[]>;
};

const TAG_ARRAY = {
  parse: (value: unknown): readonly Tag[] => {
    if (!Array.isArray(value)) {
      throw new Error("Réponse de tags invalide");
    }
    return value.map((item) => tagSchema.parse(item));
  },
};

export function createTagRepository(http: HttpClient): TagRepository {
  return {
    list: async () => {
      const response = await http.get(TAGS_PATH, tagListResponseSchema);
      return response.items;
    },
    create: (draft) => http.post(TAGS_PATH, tagDraftSchema.parse(draft), tagSchema),
    update: (id, patch) =>
      http.patch(`${TAGS_PATH}/${id}`, tagUpdateSchema.parse(patch), tagSchema),
    delete: (id) => http.delete(`${TAGS_PATH}/${id}`, { parse: (): void => undefined }),
    ensure: (names) =>
      http.post(`${TAGS_PATH}/ensure`, tagEnsureSchema.parse({ names }), TAG_ARRAY),
  };
}
