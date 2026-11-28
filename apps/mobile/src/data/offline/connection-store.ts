import { create } from "zustand";

// État d'observation réseau local (pas une entité serveur, ADR-007) : il
// alimente le bandeau RF-61 et le déclenchement du snapshot à la reconnexion.
// Il est mis à jour par le transport (réponse reçue / échec sans réponse) et,
// sur le Web, par les événements `online`/`offline` du navigateur.
export type OfflineSyncStatus = "idle" | "syncing" | "error";

type ConnectionState = {
  readonly isOnline: boolean;
  readonly lastSyncAt: string | null;
  readonly syncStatus: OfflineSyncStatus;
  readonly setOnline: (isOnline: boolean) => void;
  readonly setLastSyncAt: (lastSyncAt: string | null) => void;
  readonly setSyncStatus: (status: OfflineSyncStatus) => void;
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  isOnline: true,
  lastSyncAt: null,
  syncStatus: "idle",

  setOnline: (isOnline) => {
    set({ isOnline });
  },

  setLastSyncAt: (lastSyncAt) => {
    set({ lastSyncAt });
  },

  setSyncStatus: (syncStatus) => {
    set({ syncStatus });
  },
}));

/**
 * Écoute les événements du navigateur quand ils existent (Web/PWA). Sur mobile,
 * le transport Axios suffit : une requête sans réponse passe hors ligne, une
 * réponse reçue repasse en ligne.
 */
export function startConnectionWatcher(): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => undefined;
  }

  const update = (): void => {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      useConnectionStore.getState().setOnline(navigator.onLine);
    }
  };

  update();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);

  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}
