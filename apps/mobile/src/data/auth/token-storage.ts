import { authTokensSchema, type AuthTokens } from "@focus/contracts";
import type * as SecureStoreModule from "expo-secure-store";
import { Platform } from "react-native";

// Le refresh token ne doit jamais atterrir dans `localStorage` (O3) : sur mobile
// il vit dans le Keychain/Keystore via SecureStore. Le Web garde les jetons en
// mémoire le temps de l'onglet ; la persistance HttpOnly est planifiée avec le
// durcissement PWA (doc 03 §6.2), pas avant.
const STORAGE_KEY = "focus.session";

let webTokens: AuthTokens | null = null;

async function secureStore(): Promise<typeof SecureStoreModule> {
  // Import paresseux : le module natif n'est chargé que sur iOS/Android, donc
  // aucun test de composant ni build Web ne dépend de sa présence.
  return import("expo-secure-store");
}

export async function readTokens(): Promise<AuthTokens | null> {
  if (Platform.OS === "web") {
    return webTokens;
  }

  const store = await secureStore();
  const raw = await store.getItemAsync(STORAGE_KEY);
  if (raw === null) {
    return null;
  }

  try {
    return authTokensSchema.parse(JSON.parse(raw));
  } catch {
    // Une entrée illisible (ancien format, écriture interrompue) est purgée
    // plutôt que de bloquer le démarrage sur une session inutilisable.
    await store.deleteItemAsync(STORAGE_KEY);
    return null;
  }
}

export async function writeTokens(tokens: AuthTokens): Promise<void> {
  if (Platform.OS === "web") {
    webTokens = tokens;
    return;
  }

  const store = await secureStore();
  await store.setItemAsync(STORAGE_KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  if (Platform.OS === "web") {
    webTokens = null;
    return;
  }

  const store = await secureStore();
  await store.deleteItemAsync(STORAGE_KEY);
}
