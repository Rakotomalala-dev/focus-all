import type { LoginInput, ProfileUpdate, RegisterInput } from "@focus/contracts";
import i18n from "../../i18n";
import { queryClient } from "../query-client";
import { authApi } from "./auth-instance";
import { useSessionStore } from "./session-store";
import { readTokens } from "./token-storage";

// Après login/register, `/me` remplit l'utilisateur et le workspace courant.
// Si cette lecture échoue, les jetons sont jetés : une session sans identité
// exploitable ne doit pas laisser l'application dans un état à moitié connecté.
async function loadUser(): Promise<void> {
  try {
    const user = await authApi.me();
    useSessionStore.getState().setUser(user);
    void i18n.changeLanguage(user.locale);
  } catch (error) {
    useSessionStore.getState().clear();
    throw error;
  }
}

export async function signIn(input: LoginInput): Promise<void> {
  const tokens = await authApi.login(input);
  useSessionStore.getState().setTokens(tokens);
  await loadUser();
}

export async function signUp(input: RegisterInput): Promise<void> {
  const tokens = await authApi.register(input);
  useSessionStore.getState().setTokens(tokens);
  await loadUser();
}

export async function signOut(): Promise<void> {
  const refreshToken = useSessionStore.getState().tokens?.refreshToken;

  try {
    if (refreshToken !== undefined) {
      await authApi.logout(refreshToken);
    }
  } catch {
    // Le serveur peut être injoignable : la session locale doit tomber quand
    // même, sinon l'utilisateur reste bloqué dans une session qu'il a quittée.
  }

  useSessionStore.getState().clear();
  queryClient.clear();
}

// Appelée une fois au montage du layout racine : restaure les jetons, puis
// valide la session auprès du serveur.
export async function hydrateSession(): Promise<void> {
  const stored = await readTokens();
  if (stored === null) {
    useSessionStore.getState().markSignedOut();
    return;
  }

  useSessionStore.getState().restore(stored);
  try {
    useSessionStore.getState().setUser(await authApi.me());
    const user = useSessionStore.getState().user;
    if (user !== null) {
      void i18n.changeLanguage(user.locale);
    }
  } catch {
    useSessionStore.getState().clear();
  }
}

export async function updateProfile(input: ProfileUpdate): Promise<void> {
  const user = await authApi.updateProfile(input);
  useSessionStore.getState().setUser(user);
  void i18n.changeLanguage(user.locale);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authApi.requestPasswordReset(email);
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await authApi.confirmPasswordReset(token, password);
}

// Suppression logique côté serveur : la session locale tombe immédiatement,
// même si l'e-mail de confirmation échoue.
export async function deleteAccount(password: string): Promise<void> {
  await authApi.deleteAccount({ password, confirmation: "DELETE" });
  useSessionStore.getState().clear();
  queryClient.clear();
}
