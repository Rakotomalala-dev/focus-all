import { create } from "zustand";

// ADR-007 : la session (jeton d'accès) vit en mémoire, sans persistance. Le
// rafraîchissement viendra avec les endpoints d'authentification ; d'ici là le
// client HTTP lit simplement ce jeton et l'API répond 401 s'il est absent.
export type SessionState = {
  readonly accessToken: string | null;
  readonly setAccessToken: (accessToken: string | null) => void;
};

export const useSessionStore = create<SessionState>()((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
}));
