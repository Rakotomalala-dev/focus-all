import type { Project } from "@focus/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { ProjectDetailScreen } from "./ProjectDetailScreen";

const mocks = vi.hoisted(() => ({
  useProjects: vi.fn(),
  updateMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
  updateResult: { isPending: false, isError: false, error: null as unknown },
  deleteResult: { isPending: false, isError: false, error: null as unknown },
  back: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ back: mocks.back }),
}));

vi.mock("../api/use-projects", () => ({
  useProjects: () => mocks.useProjects(),
  useUpdateProject: () => ({ ...mocks.updateResult, mutateAsync: mocks.updateMutateAsync }),
  useDeleteProject: () => ({ ...mocks.deleteResult, mutateAsync: mocks.deleteMutateAsync }),
}));

const PROJECT: Project = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  name: "Client A",
  color: "blue",
  description: "Refonte du site",
  sortOrder: "1.000000000000000",
  archivedAt: null,
  version: 2,
  createdAt: "2026-11-26T09:00:00Z",
  updatedAt: "2026-11-26T09:00:00Z",
};

describe("ProjectDetailScreen", () => {
  beforeEach(() => {
    mocks.useProjects.mockReset();
    mocks.updateMutateAsync.mockReset();
    mocks.deleteMutateAsync.mockReset();
    mocks.back.mockReset();
    mocks.updateResult.isError = false;
    mocks.updateResult.error = null;
    mocks.deleteResult.isError = false;
    mocks.deleteResult.error = null;
  });

  it("affiche l'état de chargement", () => {
    mocks.useProjects.mockReturnValue({ status: "pending" });

    render(<ProjectDetailScreen projectId={PROJECT.id} />);

    expect(screen.getByText("Chargement des projets…")).toBeTruthy();
  });

  it("préremplit le formulaire et enregistre nom, description et couleur", async () => {
    mocks.updateMutateAsync.mockResolvedValue({ ...PROJECT, version: 3 });
    mocks.useProjects.mockReturnValue({ status: "success", data: [PROJECT] });

    render(<ProjectDetailScreen projectId={PROJECT.id} />);

    expect(screen.getByDisplayValue("Client A")).toBeTruthy();
    expect(screen.getByDisplayValue("Refonte du site")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Nom"), "Client B");
    fireEvent.press(screen.getByLabelText("Rouge"));
    fireEvent.press(screen.getByLabelText("Enregistrer"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        project: PROJECT,
        patch: { name: "Client B", color: "red", description: "Refonte du site" },
      });
    });
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it("archive le projet avec la version courante", async () => {
    mocks.updateMutateAsync.mockResolvedValue({ ...PROJECT, version: 3 });
    mocks.useProjects.mockReturnValue({ status: "success", data: [PROJECT] });

    render(<ProjectDetailScreen projectId={PROJECT.id} />);

    fireEvent.press(screen.getByLabelText("Archiver"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        project: PROJECT,
        patch: { archived: true },
      });
    });
  });

  it("demande une confirmation avant de supprimer", async () => {
    mocks.deleteMutateAsync.mockResolvedValue(undefined);
    mocks.useProjects.mockReturnValue({ status: "success", data: [PROJECT] });

    render(<ProjectDetailScreen projectId={PROJECT.id} />);

    fireEvent.press(screen.getByLabelText("Supprimer"));
    expect(mocks.deleteMutateAsync).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Confirmer la suppression"));

    await waitFor(() => {
      expect(mocks.deleteMutateAsync).toHaveBeenCalledWith(PROJECT);
    });
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it("affiche l'absence de projet", () => {
    mocks.useProjects.mockReturnValue({ status: "success", data: [] });

    render(<ProjectDetailScreen projectId={PROJECT.id} />);

    expect(screen.getByText("Projet introuvable")).toBeTruthy();
  });
});
