import type { TagDraftInput, TagUpdate } from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tagRepository } from "../../../data/tags/tag-repository-instance";

const TAG_KEY = ["tags", "list"] as const;

export function useTags() {
  return useQuery({ queryKey: TAG_KEY, queryFn: () => tagRepository.list() });
}

export function useEnsureTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (names: readonly string[]) => tagRepository.ensure(names),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TAG_KEY });
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TagDraftInput) => tagRepository.create(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TAG_KEY });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { readonly id: string; readonly patch: TagUpdate }) =>
      tagRepository.update(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TAG_KEY });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tagRepository.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TAG_KEY });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
