import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { OfflineDataSection } from "./OfflineDataSection";

type CacheState =
  | { readonly status: "pending" }
  | { readonly status: "error"; readonly error: unknown; readonly refetch: () => void }
  | {
      readonly status: "success";
      readonly data: {
        readonly cursor: number;
        readonly lastSyncAt: string | null;
        readonly taskCount: number;
        readonly projectCount: number;
        readonly tagCount: number;
        readonly corruptedCount: number;
      };
    };

type ResetState = {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
};

const mocks = vi.hoisted(() => {
  const state: { cache: CacheState; reset: ResetState } = {
    cache: { status: "pending" },
    reset: { isPending: false, isError: false, isSuccess: false },
  };
  return { state, refetch: vi.fn(), resetMutate: vi.fn() };
});

vi.mock("../api/use-offline", () => ({
  useOfflineCache: () => mocks.state.cache,
  useResetOfflineData: () => ({ ...mocks.state.reset, mutate: mocks.resetMutate }),
}));

const SYNCED = {
  cursor: 12,
  lastSyncAt: "2026-11-28T10:00:00.000Z",
  taskCount: 2,
  projectCount: 1,
  tagCount: 1,
  corruptedCount: 0,
};

describe("OfflineDataSection", () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.resetMutate.mockReset();
    mocks.state.cache = { status: "pending" };
    mocks.state.reset = { isPending: false, isError: false, isSuccess: false };
  });

  it("affiche l'état de chargement", () => {
    render(<OfflineDataSection />);

    expect(screen.getByText("Lecture de la copie locale…")).toBeTruthy();
  });

  it("affiche l'erreur et permet de réessayer", () => {
    mocks.state.cache = { status: "error", error: null, refetch: mocks.refetch };
    render(<OfflineDataSection />);

    expect(screen.getByText("La copie locale n'a pas pu être lue.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Réessayer"));

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("affiche l'état vide quand aucun instantané n'existe", () => {
    mocks.state.cache = {
      status: "success",
      data: { ...SYNCED, cursor: 0, lastSyncAt: null, taskCount: 0, projectCount: 0, tagCount: 0 },
    };
    render(<OfflineDataSection />);

    expect(
      screen.getByText(
        "Aucune donnée locale. Reconnectez-vous à Internet pour télécharger une copie.",
      ),
    ).toBeTruthy();
  });

  it("affiche le contenu, les entrées corrompues et la date de synchronisation", () => {
    mocks.state.cache = {
      status: "success",
      data: { ...SYNCED, corruptedCount: 1 },
    };
    render(<OfflineDataSection />);

    expect(screen.getByText("2 tâche(s), 1 projet(s), 1 tag(s) en cache.")).toBeTruthy();
    expect(screen.getByText(/^Dernière synchronisation : /)).toBeTruthy();
    expect(screen.getByText("1 entrée(s) illisible(s) dans la copie locale.")).toBeTruthy();
  });

  it("exige une confirmation avant de réinitialiser", () => {
    mocks.state.cache = { status: "success", data: SYNCED };
    render(<OfflineDataSection />);

    fireEvent.press(screen.getByLabelText("Réinitialiser les données locales"));
    expect(mocks.resetMutate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Confirmer la réinitialisation"));
    expect(mocks.resetMutate).toHaveBeenCalledTimes(1);
  });

  it("signale le succès et l'échec de la réinitialisation", () => {
    mocks.state.cache = { status: "success", data: SYNCED };
    mocks.state.reset = { isPending: false, isError: false, isSuccess: true };
    const { rerender } = render(<OfflineDataSection />);
    expect(
      screen.getByText("Données locales réinitialisées et instantané rechargé."),
    ).toBeTruthy();

    mocks.state.reset = { isPending: false, isError: true, isSuccess: false };
    rerender(<OfflineDataSection />);
    expect(screen.getByText("Réinitialisation impossible pour le moment.")).toBeTruthy();
  });
});
