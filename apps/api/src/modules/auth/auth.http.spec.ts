import { randomUUID } from "node:crypto";
import {
  authTokensSchema,
  meResponseSchema,
  problemDetailsSchema,
  taskListResponseSchema,
  type AuthTokens,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../../test/helpers/test-api";

// Auth de bout en bout (critère de sortie M0) : vraie base, vrai Argon2id, vrais
// JWT. Le compte est supprimé en fin de fichier (cascade sur son workspace).
const EMAIL = `auth-${randomUUID()}@focus.local`;
const PASSWORD = "mot-de-passe-de-test-2026";

let api: TestApi;

async function register(): Promise<AuthTokens> {
  const result = await api.request("/api/v1/auth/register", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD, displayName: "Test Auth" },
  });
  expect(result.status).toBe(201);
  return authTokensSchema.parse(result.body);
}

async function login(password = PASSWORD): Promise<AuthTokens> {
  const result = await api.request("/api/v1/auth/login", {
    method: "POST",
    body: { email: EMAIL, password },
  });
  expect(result.status).toBe(200);
  return authTokensSchema.parse(result.body);
}

async function refresh(refreshToken: string): Promise<AuthTokens> {
  const result = await api.request("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });
  expect(result.status).toBe(200);
  return authTokensSchema.parse(result.body);
}

function badRequest(result: { contentType: string | null; body: unknown }): {
  code: string;
  messageKey?: string;
} {
  expect(result.contentType).toContain("application/problem+json");
  const problem = problemDetailsSchema.parse(result.body);
  return {
    code: problem.code,
    ...(problem.messageKey === undefined ? {} : { messageKey: problem.messageKey }),
  };
}

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  // Si le démarrage a échoué (base momentanément indisponible), `api` est
  // indéfini : le nettoyage ne doit pas masquer l'erreur d'origine.
  await api?.deleteAccount(EMAIL);
  await api?.close();
});

describe("inscription et connexion", () => {
  it("inscrit un compte, renvoie des jetons et crée un workspace personnel", async () => {
    const tokens = await register();

    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.expiresIn).toBe(15 * 60);

    const me = await api.request("/api/v1/me", {
      authorization: `Bearer ${tokens.accessToken}`,
    });
    expect(me.status).toBe(200);
    const profile = meResponseSchema.parse(me.body);
    expect(profile.email).toBe(EMAIL);
    expect(profile.workspaces).toHaveLength(1);
    expect(profile.workspaces[0]?.isPersonal).toBe(true);
    expect(profile.workspaces[0]?.role).toBe("OWNER");
  });

  it("le jeton d'accès ouvre les routes protégées du workspace créé", async () => {
    const tokens = await login();

    const tasks = await api.request("/api/v1/tasks", {
      authorization: `Bearer ${tokens.accessToken}`,
    });

    expect(tasks.status).toBe(200);
    expect(taskListResponseSchema.parse(tasks.body)).toEqual({ items: [], nextCursor: null });
  });

  it("refuse un e-mail déjà utilisé, même avec une casse différente", async () => {
    const result = await api.request("/api/v1/auth/register", {
      method: "POST",
      body: { email: EMAIL.toUpperCase(), password: PASSWORD },
    });

    expect(result.status).toBe(409);
    expect(badRequest(result)).toMatchObject({
      code: "REQUEST_REJECTED",
      messageKey: "auth.email_taken",
    });
  });

  it("refuse un mot de passe faux sans révéler l'existence du compte", async () => {
    const wrongPassword = await api.request("/api/v1/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: "mauvais-mot-de-passe" },
    });
    const unknownAccount = await api.request("/api/v1/auth/login", {
      method: "POST",
      body: { email: `inconnu-${randomUUID()}@focus.local`, password: PASSWORD },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(badRequest(wrongPassword).messageKey).toBe("auth.invalid_credentials");
    expect(badRequest(unknownAccount).messageKey).toBe("auth.invalid_credentials");
  });

  it("refuse un mot de passe trop court à l'inscription", async () => {
    const result = await api.request("/api/v1/auth/register", {
      method: "POST",
      body: { email: `court-${randomUUID()}@focus.local`, password: "court" },
    });

    expect(result.status).toBe(400);
    expect(badRequest(result).code).toBe("VALIDATION_FAILED");
  });

  it("connecte un compte existant", async () => {
    const tokens = await login();

    const me = await api.request("/api/v1/me", {
      authorization: `Bearer ${tokens.accessToken}`,
    });
    expect(me.status).toBe(200);
  });
});

describe("rotation et révocation des sessions", () => {
  it("fait tourner le refresh token", async () => {
    const session = await login();

    const rotated = await refresh(session.refreshToken);
    expect(rotated.refreshToken).not.toBe(session.refreshToken);

    const me = await api.request("/api/v1/me", {
      authorization: `Bearer ${rotated.accessToken}`,
    });
    expect(me.status).toBe(200);
  });

  it("révoque toute la famille quand un refresh déjà consommé est rejoué", async () => {
    const session = await login();
    const rotated = await refresh(session.refreshToken);

    const replay = await api.request("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken: session.refreshToken },
    });

    expect(replay.status).toBe(401);
    expect(badRequest(replay)).toMatchObject({
      code: "SESSION_REVOKED",
      messageKey: "auth.session_revoked",
    });

    // Le successeur appartient à la même famille : il est révoqué lui aussi.
    const successor = await api.request("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken: rotated.refreshToken },
    });
    expect(successor.status).toBe(401);
    expect(badRequest(successor).messageKey).toBe("auth.session_revoked");
  });

  it("refuse un refresh token inconnu", async () => {
    const result = await api.request("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken: "jeton-inconnu-0000000000000000000000000000" },
    });

    expect(result.status).toBe(401);
    expect(badRequest(result).code).toBe("UNAUTHENTICATED");
  });

  it("déconnecte la session courante : son refresh token ne fonctionne plus", async () => {
    const session = await login();

    const logout = await api.request("/api/v1/auth/logout", {
      method: "POST",
      authorization: `Bearer ${session.accessToken}`,
      body: { refreshToken: session.refreshToken },
    });
    expect(logout.status).toBe(204);

    const afterLogout = await api.request("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken: session.refreshToken },
    });
    expect(afterLogout.status).toBe(401);
    expect(badRequest(afterLogout).messageKey).toBe("auth.session_revoked");
  });
});
