import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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
  requestExport: vi.fn(),
  exportJobData: null as null | {
    id: string;
    status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED";
    createdAt: string;
    completedAt: string | null;
    expiresAt: string | null;
    downloadUrl: string | null;
  },
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.routerReplace, back: vi.fn() }),
}));

vi.mock("../../offline", () => ({
  OfflineDataSection: () => null,
}));

vi.mock("../../notifications", () => ({
  NotificationsSection: () => null,
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
      telemetryEnabled: false,
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
  useRequestExport: () => ({
    mutateAsync: mocks.requestExport,
    isPending: false,
    isError: false,
  }),
  useExportJob: (id: string | null) => ({
    data:
      id === null
        ? null
        : (mocks.exportJobData ?? {
            id,
            status: "PENDING",
            createdAt: "2026-11-28T10:00:00.000Z",
            completedAt: null,
            expiresAt: null,
            downloadUrl: null,
          }),
  }),
}));

describe("SettingsScreen", () => {
  beforeEach(() => {
    mocks.revoke.mockReset();
    mocks.revokeAll.mockReset();
    mocks.routerReplace.mockReset();
    mocks.updateMutate.mockReset();
    mocks.changeMutate.mockReset();
    mocks.deleteMutate.mockReset();
    mocks.requestExport.mockReset();
    mocks.exportJobData = null;
    mocks.requestExport.mockResolvedValue({
      id: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4eb1",
      status: "PENDING",
      createdAt: "2026-11-28T10:00:00.000Z",
      completedAt: null,
      expiresAt: null,
      downloadUrl: null,
    });
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

  it("active la télémétrie anonyme explicitement", () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("Télémétrie anonyme: Activé"));

    expect(mocks.updateMutate).toHaveBeenCalledWith({ telemetryEnabled: true });
  });

  it("lance un export asynchrone et affiche la préparation", async () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("Exporter mes données"));

    await waitFor(() => {
      expect(mocks.requestExport).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Export en préparation. Le lien sera valable 24 h.")).toBeTruthy();
    });
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
