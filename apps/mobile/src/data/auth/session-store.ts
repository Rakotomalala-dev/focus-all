import type { AuthTokens, MeResponse } from "@focus/contracts";
import { create } from "zustand";
import { clearTokens, writeTokens } from "./token-storage";

// ADR-007 : seuls les jetons et l'utilisateur courant vivent dans un store
// client ; tout le reste de l'état serveur appartient à TanStack Query.
export type SessionStatus = "loading" | "signedOut" | "signedIn";

type SessionState = {
  readonly status: SessionStatus;
  readonly tokens: AuthTokens | null;
  readonly user: MeResponse | null;
  readonly setTokens: (tokens: AuthTokens) => void;
  readonly setUser: (user: MeResponse) => void;
  readonly restore: (tokens: AuthTokens) => void;
  readonly markSignedOut: () => void;
  readonly clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  status: "loading",
  tokens: null,
  user: null,

  setTokens: (tokens) => {
    void writeTokens(tokens);
    set({ status: "signedIn", tokens });
  },

  setUser: (user) => {
    set({ user });
  },

  // Session restaurée depuis le stockage : l'utilisateur est considéré connecté
  // avant la vérification `/me`, sinon l'écran de connexion clignoterait à
  // chaque démarrage.
  restore: (tokens) => {
    set({ status: "signedIn", tokens });
  },

  markSignedOut: () => {
    void clearTokens();
    set({ status: "signedOut", tokens: null, user: null });
  },

  clear: () => {
    void clearTokens();
    set({ status: "signedOut", tokens: null, user: null });
  },
}));
