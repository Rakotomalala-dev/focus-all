import { Platform } from "react-native";
import { createHttpClient } from "../http/client";
import { createAuthApi } from "./auth-api";
import { useSessionStore } from "./session-store";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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
});

export const authApi = createAuthApi(publicHttp, authenticatedHttp);
