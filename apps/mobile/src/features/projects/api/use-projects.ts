import type { Project, ProjectDraftInput } from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectPatchInput } from "../../../data/projects/project-repository";
import { projectRepository } from "../../../data/projects/project-repository-instance";

const PROJECT_LIST_KEY = ["projects", "list"] as const;

export function useProjects() {
  return useQuery({
    queryKey: PROJECT_LIST_KEY,
    queryFn: () => projectRepository.list(),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: ProjectDraftInput) => projectRepository.create(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECT_LIST_KEY });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ project, patch }: { readonly project: Project; readonly patch: ProjectPatchInput }) =>
      projectRepository.update(project, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECT_LIST_KEY });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (project: Project) => projectRepository.remove(project),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECT_LIST_KEY });
    },
  });
}

export function useReorderProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[]) => projectRepository.reorder(ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECT_LIST_KEY });
    },
  });
}

export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectRepository.restore(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECT_LIST_KEY });
    },
  });
}
