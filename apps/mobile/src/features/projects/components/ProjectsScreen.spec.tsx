import type { Project } from "@focus/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { ProjectsScreen } from "./ProjectsScreen";

const mocks = vi.hoisted(() => ({
  useProjects: vi.fn(),
  refetch: vi.fn(),
  createMutateAsync: vi.fn(),
  createResult: { isPending: false, isError: false, error: null as unknown },
  push: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("../api/use-projects", () => ({
  useProjects: () => mocks.useProjects(),
  useCreateProject: () => ({
    ...mocks.createResult,
    mutateAsync: mocks.createMutateAsync,
  }),
  useReorderProjects: () => ({ mutate: vi.fn(), isPending: false }),
}));

const PROJECT: Project = {
  id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
  name: "Client A",
  color: "blue",
  description: null,
  sortOrder: "1.000000000000000",
  archivedAt: null,
  version: 0,
  createdAt: "2026-11-26T09:00:00Z",
  updatedAt: "2026-11-26T09:00:00Z",
};

describe("ProjectsScreen", () => {
  beforeEach(() => {
    mocks.useProjects.mockReset();
    mocks.refetch.mockReset();
    mocks.createMutateAsync.mockReset();
    mocks.push.mockReset();
    mocks.createResult.isError = false;
    mocks.createResult.error = null;
  });

  it("affiche l'état de chargement", () => {
    mocks.useProjects.mockReturnValue({ status: "pending" });

    render(<ProjectsScreen />);

    expect(screen.getByText("Chargement des projets…")).toBeTruthy();
  });

  it("affiche l'erreur traduite et relance la requête", () => {
    mocks.useProjects.mockReturnValue({
      status: "error",
      error: new AppError({ code: "INTERNAL", status: 500 }),
      refetch: mocks.refetch,
    });

    render(<ProjectsScreen />);

    expect(screen.getByText("Impossible de charger les projets")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Réessayer"));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("affiche l'état vide", () => {
    mocks.useProjects.mockReturnValue({ status: "success", data: [] });

    render(<ProjectsScreen />);

    expect(screen.getByText("Aucun projet")).toBeTruthy();
  });

  it("liste les projets et ouvre le détail", () => {
    mocks.useProjects.mockReturnValue({ status: "success", data: [PROJECT] });

    render(<ProjectsScreen />);

    expect(screen.getByText("Client A")).toBeTruthy();
    expect(screen.getByText("Actif")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Ouvrir le projet « Client A »"));
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/projects/[id]",
      params: { id: PROJECT.id },
    });
  });

  it("valide le nom puis crée et vide le champ", async () => {
    mocks.createMutateAsync.mockResolvedValue(PROJECT);
    mocks.useProjects.mockReturnValue({ status: "success", data: [] });

    render(<ProjectsScreen />);

    fireEvent.press(screen.getByLabelText("Créer"));
    await waitFor(() => {
      expect(screen.getByText("Le nom doit contenir entre 1 et 80 caractères.")).toBeTruthy();
    });
    expect(mocks.createMutateAsync).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Nouveau projet"), "Client A");
    fireEvent.press(screen.getByLabelText("Créer"));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledWith({ name: "Client A" });
    });
  });
});
