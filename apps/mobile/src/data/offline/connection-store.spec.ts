import { beforeEach, describe, expect, it } from "vitest";
import { useConnectionStore } from "./connection-store";

describe("connectionStore", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      isOnline: true,
      lastSyncAt: null,
      syncStatus: "idle",
    });
  });

  it("bascule hors ligne puis en ligne", () => {
    useConnectionStore.getState().setOnline(false);
    expect(useConnectionStore.getState().isOnline).toBe(false);

    useConnectionStore.getState().setOnline(true);
    expect(useConnectionStore.getState().isOnline).toBe(true);
  });

  it("mémorise la dernière synchronisation et son statut", () => {
    useConnectionStore.getState().setSyncStatus("syncing");
    expect(useConnectionStore.getState().syncStatus).toBe("syncing");

    useConnectionStore.getState().setLastSyncAt("2026-11-28T10:00:00.000Z");
    useConnectionStore.getState().setSyncStatus("idle");

    expect(useConnectionStore.getState()).toMatchObject({
      lastSyncAt: "2026-11-28T10:00:00.000Z",
      syncStatus: "idle",
    });
  });
});
