import {
  authTokensSchema,
  loginInputSchema,
  meResponseSchema,
  registerInputSchema,
  type AuthTokens,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
} from "@focus/contracts";
import type { HttpClient } from "../http/client";

// 204 ne porte pas de corps : le schéma vide garde `send()` homogène et évite
// un second chemin non validé dans le client HTTP.
const NO_CONTENT = { parse: (): void => undefined };

export type AuthApi = {
  readonly login: (input: LoginInput) => Promise<AuthTokens>;
  readonly register: (input: RegisterInput) => Promise<AuthTokens>;
  readonly refresh: (refreshToken: string) => Promise<AuthTokens>;
  readonly logout: (refreshToken: string) => Promise<void>;
  readonly me: () => Promise<MeResponse>;
};

// `publicHttp` ne porte aucun jeton (login/register/refresh), `authenticatedHttp`
// ajoute l'en-tête et rafraîchit sur 401 : une route protégée ne peut pas
// dépendre d'un jeton laissé par mégarde à l'appelant.
export function createAuthApi(
  publicHttp: HttpClient,
  authenticatedHttp: HttpClient,
): AuthApi {
  return {
    login: (input) =>
      publicHttp.post("/auth/login", loginInputSchema.parse(input), authTokensSchema),

    register: (input) =>
      publicHttp.post("/auth/register", registerInputSchema.parse(input), authTokensSchema),

    refresh: (refreshToken) =>
      publicHttp.post("/auth/refresh", { refreshToken }, authTokensSchema),

    logout: (refreshToken) =>
      authenticatedHttp.post("/auth/logout", { refreshToken }, NO_CONTENT),

    me: () => authenticatedHttp.get("/me", meResponseSchema),
  };
}
