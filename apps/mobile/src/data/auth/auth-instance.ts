import { Platform } from "react-native";
import { createHttpClient } from "../http/client";
import { useConnectionStore } from "../offline/connection-store";
import { createAuthApi } from "./auth-api";
import { useSessionStore } from "./session-store";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Les liens signés renvoyés par l'API sont relatifs (`/api/v1/...`) : le client
// les résout avec l'origine de sa propre configuration.
export function resolveApiUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString();
}

export const publicHttp = createHttpClient({
  baseUrl: API_BASE_URL,
  platform: Platform.OS,
});

// Un seul rafraîchissement à la fois : cinq requêtes qui reçoivent 401 en même
// temps doivent produire un refresh, pas cinq rotations (dont quatre
// révoqueraient la famille côté serveur).
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { tokens, clear } = useSessionStore.getState();
  if (tokens === null) {
    return null;
  }

  refreshInFlight ??= authApi
    .refresh(tokens.refreshToken)
    .then((next) => {
      useSessionStore.getState().setTokens(next);
      return next.accessToken;
    })
    .catch(() => {
      // Refresh refusé (expiré, révoqué, rejeu) : la session locale est morte,
      // l'écran de connexion reprend la main.
      clear();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export const authenticatedHttp = createHttpClient({
  baseUrl: API_BASE_URL,
  platform: Platform.OS,
  auth: {
    getAccessToken: () => useSessionStore.getState().tokens?.accessToken ?? null,
    refreshAccessToken,
  },
  // Toute requête authentifiée renseigne la connectivité : une réponse reçue
  // (même 4xx/5xx) prouve que le réseau est là, un échec sans réponse non.
  onNetworkStatusChange: (isOnline) => {
    useConnectionStore.getState().setOnline(isOnline);
  },
});

export const authApi = createAuthApi(publicHttp, authenticatedHttp);
