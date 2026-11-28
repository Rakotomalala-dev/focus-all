import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSessionStore } from "../../../data/auth/session-store";
import { useConnectionStore } from "../../../data/offline/connection-store";
import {
  offlineService,
  resetOfflineState,
  synchronizeOfflineState,
} from "../../../data/offline/offline-service-instance";

export const OFFLINE_STATUS_KEY = ["offline", "status"] as const;

export function useOfflineCache() {
  return useQuery({
    queryKey: OFFLINE_STATUS_KEY,
    queryFn: () => offlineService.readStatus(),
    staleTime: 5_000,
  });
}

// Bootstrap du miroir : à l'ouverture de session et à chaque retour en ligne,
// un instantané complet remplace la copie locale (RF-61). L'état de la
// synchronisation est publié dans le store consommé par le bandeau.
export function useOfflineSync(): void {
  const sessionStatus = useSessionStore((state) => state.status);
  const isOnline = useConnectionStore((state) => state.isOnline);
  const queryClient = useQueryClient();

  // Au démarrage, le bandeau doit afficher la date du miroir persistant avant
  // même que le premier appel réseau n'aboutisse.
  useEffect(() => {
    let active = true;
    void offlineService.readStatus().then(
      (status) => {
        if (active && status.lastSyncAt !== null) {
          useConnectionStore.getState().setLastSyncAt(status.lastSyncAt);
        }
      },
      // La lecture est exposée par `useOfflineCache` ; un échec ici ne doit pas
      // empêcher le bootstrap, la synchronisation qui suit retentera.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (sessionStatus !== "signedIn" || !isOnline) return;
    void synchronizeOfflineState().then((outcome) => {
      if (outcome.ok) {
        void queryClient.invalidateQueries({ queryKey: OFFLINE_STATUS_KEY });
      }
    });
  }, [isOnline, queryClient, sessionStatus]);
}

// RF-64 : la réinitialisation vide la copie locale puis recharge un instantané
// complet ; l'échec est remonté à l'écran, jamais avalé.
export function useResetOfflineData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const outcome = await resetOfflineState();
      if (!outcome.ok) throw outcome.error;
      return outcome.result;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: OFFLINE_STATUS_KEY }),
      ]);
    },
  });
}
