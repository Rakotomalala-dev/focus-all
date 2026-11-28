import {
  authTokensSchema,
  exportJobSchema,
  connectionListResponseSchema,
  loginInputSchema,
  meResponseSchema,
  passwordChangeSchema,
  passwordResetConfirmSchema,
  profileUpdateSchema,
  registerInputSchema,
  sessionListResponseSchema,
  telemetryEventSchema,
  type AuthTokens,
  type ConnectionListResponse,
  type DeleteAccount,
  type ExportJob,
  type LoginInput,
  type MeResponse,
  type PasswordChange,
  type ProfileUpdate,
  type RegisterInput,
  type SessionListResponse,
  type TelemetryEvent,
} from "@focus/contracts";
import type { HttpClient } from "../http/client";

// 202/204 ne portent pas de corps : le schéma vide garde `send()` homogène et
// évite un second chemin non validé dans le client HTTP.
const NO_CONTENT = { parse: (): void => undefined };

export type AuthApi = {
  readonly login: (input: LoginInput) => Promise<AuthTokens>;
  readonly register: (input: RegisterInput) => Promise<AuthTokens>;
  readonly refresh: (refreshToken: string) => Promise<AuthTokens>;
  readonly logout: (refreshToken: string) => Promise<void>;
  readonly me: () => Promise<MeResponse>;
  readonly updateProfile: (input: ProfileUpdate) => Promise<MeResponse>;
  readonly sessions: () => Promise<SessionListResponse>;
  readonly connections: () => Promise<ConnectionListResponse>;
  readonly revokeSession: (id: string) => Promise<void>;
  readonly revokeAllSessions: () => Promise<void>;
  readonly changePassword: (input: PasswordChange) => Promise<void>;
  readonly requestPasswordReset: (email: string) => Promise<void>;
  readonly confirmPasswordReset: (token: string, password: string) => Promise<void>;
  readonly deleteAccount: (input: DeleteAccount) => Promise<void>;
  // RF-71 : l'export est un job asynchrone, le lien arrive au statut READY.
  readonly requestExport: () => Promise<ExportJob>;
  readonly exportJob: (id: string) => Promise<ExportJob>;
  // RF-72 : sans consentement, le serveur ignore l'événement (204).
  readonly telemetry: (event: TelemetryEvent) => Promise<void>;
};

// `publicHttp` ne porte aucun jeton (login/register/refresh/reset), et
// `authenticatedHttp` ajoute l'en-tête et rafraîchit sur 401.
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

    updateProfile: (input) =>
      authenticatedHttp.patch("/me", profileUpdateSchema.parse(input), meResponseSchema),

    sessions: () => authenticatedHttp.get("/auth/sessions", sessionListResponseSchema),

    connections: () =>
      authenticatedHttp.get("/auth/connections", connectionListResponseSchema),

    revokeSession: (id) =>
      authenticatedHttp.delete(`/auth/sessions/${id}`, NO_CONTENT),

    revokeAllSessions: () => authenticatedHttp.delete("/auth/sessions", NO_CONTENT),

    changePassword: (input) =>
      authenticatedHttp.post("/auth/password/change", passwordChangeSchema.parse(input), NO_CONTENT),

    requestPasswordReset: (email) =>
      publicHttp.post(
        "/auth/password-reset/request",
        { email },
        NO_CONTENT,
      ),

    confirmPasswordReset: (token, password) =>
      publicHttp.post(
        "/auth/password-reset/confirm",
        passwordResetConfirmSchema.parse({ token, password }),
        NO_CONTENT,
      ),

    deleteAccount: (input) =>
      authenticatedHttp.delete("/me", NO_CONTENT, undefined, input),

    requestExport: () =>
      authenticatedHttp.post("/me/export", {}, exportJobSchema),

    exportJob: (id) =>
      authenticatedHttp.get(`/me/export/${id}`, exportJobSchema),

    telemetry: (event) =>
      authenticatedHttp.post(
        "/telemetry/events",
        telemetryEventSchema.parse(event),
        NO_CONTENT,
      ),
  };
}
