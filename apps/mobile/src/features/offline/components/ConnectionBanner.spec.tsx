import { render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { useConnectionStore } from "../../../data/offline/connection-store";
import { ConnectionBanner } from "./ConnectionBanner";

const LAST_SYNC = "2026-11-28T10:00:00.000Z";

describe("ConnectionBanner", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      isOnline: true,
      lastSyncAt: null,
      syncStatus: "idle",
    });
  });

  it("affiche l'état en ligne et l'absence de synchronisation", () => {
    render(<ConnectionBanner />);

    expect(
      screen.getByText("En ligne · Dernière synchronisation : jamais"),
    ).toBeTruthy();
  });

  it("affiche l'état hors ligne avec la dernière synchronisation", () => {
    useConnectionStore.setState({
      isOnline: false,
      lastSyncAt: LAST_SYNC,
      syncStatus: "idle",
    });
    render(<ConnectionBanner />);

    expect(screen.getByLabelText(/^Hors ligne · Dernière synchronisation : /)).toBeTruthy();
  });

  it("annonce une synchronisation en cours", () => {
    useConnectionStore.setState({ syncStatus: "syncing" });
    render(<ConnectionBanner />);

    expect(screen.getByText("Synchronisation en cours…")).toBeTruthy();
  });

  it("signale une synchronisation impossible sans masquer la date", () => {
    useConnectionStore.setState({
      isOnline: true,
      lastSyncAt: LAST_SYNC,
      syncStatus: "error",
    });
    render(<ConnectionBanner />);

    expect(
      screen.getByLabelText(/^Synchronisation impossible · Dernière synchronisation : /),
    ).toBeTruthy();
  });
});
