import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { useNotificationStore } from "../../../data/notifications/notification-store";
import { NotificationsSection } from "./NotificationsSection";

type PreferencesState =
  | { readonly status: "pending" }
  | { readonly status: "error"; readonly error: unknown; readonly refetch: () => void }
  | {
      readonly status: "success";
      readonly data: {
        readonly remindersEnabled: boolean;
        readonly dailySummaryEnabled: boolean;
        readonly collaborationEnabled: boolean;
        readonly quietHours: { readonly start: string; readonly end: string } | null;
      };
    };

type DeviceState =
  | { readonly status: "pending" }
  | {
      readonly status: "success";
      readonly data: { readonly deviceId: string; readonly notificationsEnabled: boolean } | null;
    };

const mocks = vi.hoisted(() => {
  const state: { preferences: PreferencesState; device: DeviceState } = {
    preferences: { status: "pending" },
    device: { status: "pending" },
  };
  return {
    state,
    refetch: vi.fn(),
    registerMutate: vi.fn(),
    setDeviceMutate: vi.fn(),
    updateMutate: vi.fn(),
  };
});

vi.mock("../api/use-notifications", () => ({
  useNotificationPreferences: () => mocks.state.preferences,
  useStoredDevice: () => mocks.state.device,
  useRegisterPushDevice: () => ({
    mutate: mocks.registerMutate,
    isPending: false,
    isError: false,
  }),
  useSetDeviceNotifications: () => ({
    mutate: mocks.setDeviceMutate,
    isPending: false,
  }),
  useUpdateNotificationPreferences: () => ({
    mutate: mocks.updateMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

const PREFERENCES = {
  remindersEnabled: true,
  dailySummaryEnabled: false,
  collaborationEnabled: true,
  quietHours: null,
};

const DEVICE = { deviceId: "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e72", notificationsEnabled: true };

describe("NotificationsSection", () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.registerMutate.mockReset();
    mocks.setDeviceMutate.mockReset();
    mocks.updateMutate.mockReset();
    mocks.state.preferences = { status: "pending" };
    mocks.state.device = { status: "pending" };
    useNotificationStore.setState({ schedulingFailed: false });
  });

  it("affiche l'état de chargement", () => {
    render(<NotificationsSection />);

    expect(screen.getByText("Chargement des préférences…")).toBeTruthy();
  });

  it("affiche l'erreur et permet de réessayer", () => {
    mocks.state.preferences = { status: "error", error: null, refetch: mocks.refetch };
    mocks.state.device = { status: "success", data: null };
    render(<NotificationsSection />);

    expect(
      screen.getByText("Les préférences de notifications n'ont pas pu être chargées."),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Réessayer"));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("affiche l'état vide tant qu'aucun appareil n'est enregistré", () => {
    mocks.state.preferences = { status: "success", data: PREFERENCES };
    mocks.state.device = { status: "success", data: null };
    render(<NotificationsSection />);

    expect(
      screen.getByText("Cet appareil n'est pas encore enregistré pour les notifications."),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Activer les notifications"));
    expect(mocks.registerMutate).toHaveBeenCalledTimes(1);
  });

  it("bascule les catégories et la plage silencieuse", () => {
    mocks.state.preferences = { status: "success", data: PREFERENCES };
    mocks.state.device = { status: "success", data: DEVICE };
    render(<NotificationsSection />);

    fireEvent(screen.getByLabelText("Rappels"), "valueChange", false);
    expect(mocks.updateMutate).toHaveBeenCalledWith({ remindersEnabled: false });

    fireEvent(screen.getByLabelText("Activer la plage silencieuse"), "valueChange", true);
    fireEvent.press(screen.getByLabelText("Enregistrer la plage"));
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      quietHours: { start: "22:00", end: "08:00" },
    });
  });

  it("refuse une plage silencieuse mal formée", () => {
    mocks.state.preferences = { status: "success", data: PREFERENCES };
    mocks.state.device = { status: "success", data: DEVICE };
    render(<NotificationsSection />);

    fireEvent(screen.getByLabelText("Activer la plage silencieuse"), "valueChange", true);
    fireEvent.changeText(screen.getByLabelText("Début"), "25:00");
    fireEvent.press(screen.getByLabelText("Enregistrer la plage"));

    expect(mocks.updateMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Utilisez le format HH:MM et deux heures différentes."),
    ).toBeTruthy();
  });

  it("désactive les notifications de cet appareil", () => {
    mocks.state.preferences = { status: "success", data: PREFERENCES };
    mocks.state.device = { status: "success", data: DEVICE };
    render(<NotificationsSection />);

    fireEvent(
      screen.getByLabelText("Recevoir les notifications sur cet appareil"),
      "valueChange",
      false,
    );

    expect(mocks.setDeviceMutate).toHaveBeenCalledWith(false);
  });

  it("signale un échec de planification locale", () => {
    mocks.state.preferences = { status: "success", data: PREFERENCES };
    mocks.state.device = { status: "success", data: DEVICE };
    useNotificationStore.setState({ schedulingFailed: true });
    render(<NotificationsSection />);

    expect(
      screen.getByText("Les notifications locales n'ont pas pu être planifiées."),
    ).toBeTruthy();
  });
});
