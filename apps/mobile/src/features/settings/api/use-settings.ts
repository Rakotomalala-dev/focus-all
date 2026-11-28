import type { PasswordChange, ProfileUpdate } from "@focus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../../../data/auth/auth-instance";
import { signOut, updateProfile } from "../../../data/auth/auth-service";

const SESSIONS_KEY = ["auth", "sessions"] as const;
const CONNECTIONS_KEY = ["auth", "connections"] as const;

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdate) => updateProfile(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => authApi.sessions(),
  });
}

export function useConnections() {
  return useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => authApi.connections(),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });
}

// « Tout déconnecter » révoque aussi la session courante : le client termine
// sa session locale et revient à l'écran de connexion.
export function useRevokeAllSessions() {
  return useMutation({
    mutationFn: async () => {
      await authApi.revokeAllSessions();
      await signOut();
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: PasswordChange) => authApi.changePassword(input),
  });
}

export function useRequestExport() {
  return useMutation({ mutationFn: () => authApi.requestExport() });
}

// Polling court pendant la préparation ; le serveur ne conserve le lien que
// 24 h, et `READY` est terminal côté client.
export function useExportJob(id: string | null) {
  return useQuery({
    queryKey: ["auth", "export", id] as const,
    enabled: id !== null,
    queryFn: () => {
      if (id === null) {
        throw new Error("export id missing");
      }
      return authApi.exportJob(id);
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "PENDING" || status === "PROCESSING" ? 2_000 : false;
    },
  });
}
