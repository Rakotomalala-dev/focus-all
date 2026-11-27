import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { SettingsScreen } from "./SettingsScreen";

const mocks = vi.hoisted(() => ({
  revoke: vi.fn(),
  revokeAll: vi.fn(),
  routerReplace: vi.fn(),
  updateMutate: vi.fn(),
  changeMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.routerReplace, back: vi.fn() }),
}));

vi.mock("../../auth/api/use-auth", () => ({
  useSession: () => ({
    user: {
      id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f",
      email: "ada@focus.local",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      timezone: "Europe/Paris",
      locale: "fr",
      weekStartsOn: "MONDAY",
      timeFormat: "H24",
      theme: "SYSTEM",
      quickAddParsingEnabled: true,
      workspaces: [],
    },
  }),
  useDeleteAccount: () => ({
    mutate: mocks.deleteMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../api/use-settings", () => ({
  useUpdateProfile: () => ({
    mutate: mocks.updateMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
  useChangePassword: () => ({
    mutate: mocks.changeMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
  useSessions: () => ({
    status: "success",
    data: {
      items: [
        {
          id: "session-1",
          current: true,
          platform: "android",
          deviceName: "Pixel de test",
          createdAt: "2026-11-26T09:00:00.000Z",
          lastUsedAt: "2026-11-26T10:00:00.000Z",
          expiresAt: "2026-12-26T10:00:00.000Z",
        },
      ],
    },
  }),
  useConnections: () => ({
    status: "success",
    data: {
      items: [
        {
          id: "session-1",
          current: true,
          platform: "android",
          deviceName: "Pixel de test",
          createdAt: "2026-11-26T09:00:00.000Z",
          lastUsedAt: "2026-11-26T10:00:00.000Z",
          expiresAt: "2026-12-26T10:00:00.000Z",
          active: true,
          revokedAt: null,
        },
      ],
    },
  }),
  useRevokeSession: () => ({ mutate: mocks.revoke, isPending: false }),
  useRevokeAllSessions: () => ({ mutate: mocks.revokeAll, isPending: false }),
  useExportAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("SettingsScreen", () => {
  beforeEach(() => {
    mocks.revoke.mockReset();
    mocks.revokeAll.mockReset();
    mocks.routerReplace.mockReset();
    mocks.updateMutate.mockReset();
    mocks.changeMutate.mockReset();
    mocks.deleteMutate.mockReset();
  });

  it("affiche le profil, les préférences et les sessions actives", () => {
    render(<SettingsScreen />);

    expect(screen.getByText("Profil")).toBeTruthy();
    expect(screen.getByLabelText("Nom affiché").props.value).toBe("Ada Lovelace");
    expect(screen.getByText("Préférences")).toBeTruthy();
    expect(screen.getByText("Sessions actives")).toBeTruthy();
    expect(screen.getByText("Pixel de test · session courante")).toBeTruthy();
    expect(screen.getByText("Dernières connexions")).toBeTruthy();
  });

  it("révoque une session", () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("Révoquer cette session"));

    expect(mocks.revoke).toHaveBeenCalledWith("session-1");
  });

  it("exige le littéral DELETE avant d'activer la suppression", () => {
    render(<SettingsScreen />);

    const deleteButton = screen.getByLabelText("Supprimer définitivement mon compte");
    expect(deleteButton.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(
      screen.getByLabelText("Saisissez DELETE pour confirmer"),
      "DELETE",
    );
    fireEvent.press(deleteButton);

    // Le mot de passe reste vide : la confirmation forte n'est pas complète.
    expect(mocks.deleteMutate).not.toHaveBeenCalled();
  });
});
