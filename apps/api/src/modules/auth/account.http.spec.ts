import { randomUUID } from "node:crypto";
import {
  authTokensSchema,
  exportJobSchema,
  connectionListResponseSchema,
  meResponseSchema,
  problemDetailsSchema,
  sessionListResponseSchema,
  type AuthTokens,
} from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../../test/helpers/test-api";

// Domaine Compte et sécurité (RF-01/02/03/04/06/70) : vraie base, vrai
// Argon2id, vrai JWT, port e-mail remplacé par une boîte mémoire.
const PASSWORD = "mot-de-passe-de-test-2026";
const NEW_PASSWORD = "nouveau-mot-de-passe-2026";

let api: TestApi;
const createdEmails = new Set<string>();

function emailFor(label: string): string {
  const email = `${label}-${randomUUID()}@focus.local`;
  createdEmails.add(email);
  return email;
}

async function register(email: string, password = PASSWORD): Promise<AuthTokens> {
  const result = await api.request("/api/v1/auth/register", {
    method: "POST",
    body: { email, password, displayName: "Compte Test" },
  });
  expect(result.status).toBe(201);
  return authTokensSchema.parse(result.body);
}

async function login(
  email: string,
  password = PASSWORD,
  deviceName?: string,
): Promise<AuthTokens> {
  const result = await api.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "x-client-platform": "android" },
    body: { email, password, ...(deviceName === undefined ? {} : { deviceName }) },
  });
  expect(result.status).toBe(200);
  return authTokensSchema.parse(result.body);
}

async function refresh(refreshToken: string) {
  return api.request("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });
}

function problem(result: { contentType: string | null; body: unknown }): {
  code: string;
  messageKey?: string;
  params?: Record<string, unknown>;
} {
  expect(result.contentType).toContain("application/problem+json");
  const parsed = problemDetailsSchema.parse(result.body);
  return {
    code: parsed.code,
    ...(parsed.messageKey === undefined ? {} : { messageKey: parsed.messageKey }),
    ...(parsed.params === undefined ? {} : { params: parsed.params }),
  };
}

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  for (const email of createdEmails) {
    await api?.deleteAccount(email);
  }
  await api?.close();
});

describe("RF-01 — verrouillage progressif", () => {
  it("bloque après 5 échecs avec un délai explicite en 429", async () => {
    const email = emailFor("lockout");
    await register(email);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failure = await api.request("/api/v1/auth/login", {
        method: "POST",
        body: { email, password: "mauvais-mot-de-passe" },
      });
      expect(failure.status).toBe(401);
    }

    const fifth = await api.request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password: "mauvais-mot-de-passe" },
    });
    expect(fifth.status).toBe(429);
    const details = problem(fifth);
    expect(details.code).toBe("RATE_LIMITED");
    expect(details.messageKey).toBe("auth.too_many_attempts");
    expect(details.params?.retryAfterSeconds).toBeGreaterThan(0);

    // Même le bon mot de passe reste refusé pendant le verrouillage.
    const locked = await api.request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password: PASSWORD },
    });
    expect(locked.status).toBe(429);
  });

  it("nettoie le compteur après une connexion réussie", async () => {
    const email = emailFor("counter");
    await register(email);

    const failure = await api.request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password: "mauvais-mot-de-passe" },
    });
    expect(failure.status).toBe(401);

    await login(email);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const next = await api.request("/api/v1/auth/login", {
        method: "POST",
        body: { email, password: "mauvais-mot-de-passe" },
      });
      expect(next.status).toBe(401);
    }
  });
});

describe("RF-02 — réinitialisation du mot de passe", () => {
  it("répond toujours 202, sans révéler l'existence du compte", async () => {
    const unknown = await api.request("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: { email: emailFor("unknown-reset") },
    });
    expect(unknown.status).toBe(202);
    expect(unknown.body).toBeNull();
  });

  it("consomme un jeton à usage unique et révoque toutes les sessions", async () => {
    const email = emailFor("reset");
    const session = await register(email);

    const request = await api.request("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: { email },
    });
    expect(request.status).toBe(202);

    const sent = api.mailbox.lastPasswordReset();
    expect(sent?.to).toBe(email);
    const token = new URL(sent?.link ?? "").searchParams.get("token");
    expect(token).not.toBeNull();

    const confirm = await api.request("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: { token, password: NEW_PASSWORD },
    });
    expect(confirm.status).toBe(204);

    // Ancien mot de passe refusé, nouveau accepté.
    const oldPassword = await api.request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password: PASSWORD },
    });
    expect(oldPassword.status).toBe(401);

    const newPassword = await login(email, NEW_PASSWORD);
    expect(newPassword.accessToken.length).toBeGreaterThan(0);

    // La session ouverte avant le changement est révoquée.
    const stale = await refresh(session.refreshToken);
    expect(stale.status).toBe(401);

    // Le jeton ne peut pas être rejoué.
    const replay = await api.request("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: { token, password: "encore-un-autre-mot-de-passe" },
    });
    expect(replay.status).toBe(400);
    expect(problem(replay).messageKey).toBe("auth.invalid_reset_token");
  });

  it("refuse un jeton inconnu", async () => {
    const result = await api.request("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: { token: "jeton-inconnu-".padEnd(48, "0"), password: NEW_PASSWORD },
    });
    expect(result.status).toBe(400);
    expect(problem(result).messageKey).toBe("auth.invalid_reset_token");
  });
});

describe("RF-03 / RF-70 — sessions, appareils et dernières connexions", () => {
  it("liste, révoque une session puis toutes les sessions", async () => {
    const email = emailFor("sessions");
    const first = await register(email);
    const second = await login(email, PASSWORD, "Pixel de test");

    const headers = { authorization: `Bearer ${second.accessToken}` };
    const listed = await api.request("/api/v1/auth/sessions", { headers });
    expect(listed.status).toBe(200);
    const sessions = sessionListResponseSchema.parse(listed.body);
    expect(sessions.items.length).toBeGreaterThanOrEqual(2);
    const current = sessions.items.find((session) => session.current);
    expect(current?.deviceName).toBe("Pixel de test");
    expect(current?.platform).toBe("android");

    const target = sessions.items.find((session) => session.id !== current?.id);
    expect(target).toBeDefined();

    const revoked = await api.request(`/api/v1/auth/sessions/${target?.id}`, {
      method: "DELETE",
      headers,
    });
    expect(revoked.status).toBe(204);

    // La session enregistrée à l'inscription est celle qui vient d'être
    // révoquée : son refresh ne fonctionne plus.
    const stale = await refresh(first.refreshToken);
    expect(stale.status).toBe(401);

    const connections = await api.request("/api/v1/auth/connections", { headers });
    expect(connections.status).toBe(200);
    const history = connectionListResponseSchema.parse(connections.body);
    expect(history.items.some((entry) => entry.active)).toBe(true);
    expect(history.items.some((entry) => entry.active === false)).toBe(true);

    const revokeAll = await api.request("/api/v1/auth/sessions", {
      method: "DELETE",
      headers,
    });
    expect(revokeAll.status).toBe(204);
    expect((await refresh(second.refreshToken)).status).toBe(401);
  });

  it("ne révèle pas la session d'un autre compte", async () => {
    const owner = await register(emailFor("session-owner"));
    const intruder = await register(emailFor("session-intruder"));

    const listed = await api.request("/api/v1/auth/sessions", {
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const owned = sessionListResponseSchema.parse(listed.body).items[0];

    const result = await api.request(`/api/v1/auth/sessions/${owned?.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${intruder.accessToken}` },
    });
    expect(result.status).toBe(404);
    expect(problem(result).messageKey).toBe("auth.session_not_found");
  });
});

describe("RF-04 — profil et préférences", () => {
  it("met à jour le profil et applique les préférences", async () => {
    const email = emailFor("profile");
    const tokens = await register(email);
    const headers = { authorization: `Bearer ${tokens.accessToken}` };

    const updated = await api.request("/api/v1/me", {
      method: "PATCH",
      headers,
      body: {
        displayName: "Ada Lovelace",
        timezone: "Europe/London",
        locale: "en",
        weekStartsOn: "SUNDAY",
        timeFormat: "H12",
        theme: "DARK",
      },
    });
    expect(updated.status).toBe(200);
    const profile = meResponseSchema.parse(updated.body);
    expect(profile).toMatchObject({
      displayName: "Ada Lovelace",
      timezone: "Europe/London",
      locale: "en",
      weekStartsOn: "SUNDAY",
      timeFormat: "H12",
      theme: "DARK",
      avatarUrl: null,
    });

    const reread = await api.request("/api/v1/me", { headers });
    expect(meResponseSchema.parse(reread.body).theme).toBe("DARK");
  });

  it("refuse un fuseau invalide et un corps vide", async () => {
    const tokens = await register(emailFor("profile-invalid"));
    const headers = { authorization: `Bearer ${tokens.accessToken}` };

    const badZone = await api.request("/api/v1/me", {
      method: "PATCH",
      headers,
      body: { timezone: "Mars/Olympus" },
    });
    expect(badZone.status).toBe(400);
    expect(problem(badZone).code).toBe("VALIDATION_FAILED");

    const empty = await api.request("/api/v1/me", {
      method: "PATCH",
      headers,
      body: {},
    });
    expect(empty.status).toBe(400);
  });

  it("change le mot de passe sans révoquer la session courante", async () => {
    const email = emailFor("change-password");
    const current = await register(email);
    const other = await login(email);

    const changed = await api.request("/api/v1/auth/password/change", {
      method: "POST",
      headers: { authorization: `Bearer ${current.accessToken}` },
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(changed.status).toBe(204);

    expect((await refresh(current.refreshToken)).status).toBe(200);
    expect((await refresh(other.refreshToken)).status).toBe(401);
    await login(email, NEW_PASSWORD);

    const wrongCurrent = await api.request("/api/v1/auth/password/change", {
      method: "POST",
      headers: { authorization: `Bearer ${current.accessToken}` },
      body: { currentPassword: "faux-mot-de-passe", newPassword: "encore-un-autre-mot-de-passe" },
    });
    expect(wrongCurrent.status).toBe(400);
    expect(problem(wrongCurrent).messageKey).toBe("auth.current_password_invalid");
  });
});

describe("RF-06 — export et suppression de compte", () => {
  it("exporte les données avant suppression", async () => {
    const email = emailFor("export");
    const tokens = await register(email);
    const headers = { authorization: `Bearer ${tokens.accessToken}` };

    const created = await api.request("/api/v1/tasks", {
      method: "POST",
      headers,
      body: { title: "Tâche exportée" },
    });
    expect(created.status).toBe(201);

    // RF-71 : l'export est désormais un job ; RF-06 vérifie qu'il est proposé.
    const started = await api.request("/api/v1/me/export", { method: "POST", headers });
    expect(started.status).toBe(202);
    const job = exportJobSchema.parse(started.body);
    expect(job.status).toBe("PENDING");

    const status = await api.request(`/api/v1/me/export/${job.id}`, { headers });
    expect(status.status).toBe(200);
    expect(exportJobSchema.parse(status.body).status).toBe("PENDING");
  });

  it("exige une confirmation forte puis supprime logiquement le compte", async () => {
    const email = emailFor("delete");
    const tokens = await register(email);
    const headers = { authorization: `Bearer ${tokens.accessToken}` };

    const weak = await api.request("/api/v1/me", {
      method: "DELETE",
      headers,
      body: { password: PASSWORD, confirmation: "oui" },
    });
    expect(weak.status).toBe(400);

    const wrongPassword = await api.request("/api/v1/me", {
      method: "DELETE",
      headers,
      body: { password: "faux-mot-de-passe", confirmation: "DELETE" },
    });
    expect(wrongPassword.status).toBe(400);
    expect(problem(wrongPassword).messageKey).toBe("auth.current_password_invalid");

    const deleted = await api.request("/api/v1/me", {
      method: "DELETE",
      headers,
      body: { password: PASSWORD, confirmation: "DELETE" },
    });
    expect(deleted.status).toBe(204);
    expect(api.mailbox.deletions.some((mail) => mail.to === email)).toBe(true);

    const signedOut = await api.request("/api/v1/me", { headers });
    expect(signedOut.status).toBe(401);

    const cannotLogin = await api.request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password: PASSWORD },
    });
    expect(cannotLogin.status).toBe(401);
    expect((await refresh(tokens.refreshToken)).status).toBe(401);

    // RF-06 : le job purge physiquement le compte après 30 jours ; l'e-mail
    // redevient alors disponible (la cascade efface workspaces et tâches).
    const purged = await api.purgeAccounts(
      new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
    );
    expect(purged).toBeGreaterThanOrEqual(1);
    const registeredAgain = await register(email);
    expect(registeredAgain.accessToken.length).toBeGreaterThan(0);
  });
});
