import { problemDetailsSchema, taskListResponseSchema, taskSchema } from "@focus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestApi,
  type HttpResult,
  type TestApi,
  type TokenClaims,
} from "../../../test/helpers/test-api";

// Authentification et cloisonnement de bout en bout : vraie application Nest +
// Fastify, vrais jetons signés. Aucun test ne contourne le guard, sinon il ne
// prouverait rien sur l'exigence N-3/S-2.
const OTHER_SECRET = "other-secret-000000000000000000000000000";
const WORKSPACE_A = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f";
const WORKSPACE_B = "018f3b3c-1a2b-7c3d-8e4f-111111111111";
const USER_A = "018f3b3c-1a2b-7c3d-8e4f-444444444444";
const USER_B = "018f3b3c-1a2b-7c3d-8e4f-555555555555";

let api: TestApi;
let tokenA = "";
let tokenB = "";

function unauthorizedBody(result: HttpResult): {
  status: number;
  code: string;
  messageKey?: string;
} {
  expect(result.contentType).toContain("application/problem+json");
  const problem = problemDetailsSchema.parse(result.body);
  return {
    status: problem.status,
    code: problem.code,
    ...(problem.messageKey === undefined ? {} : { messageKey: problem.messageKey }),
  };
}

// Jeton de A par défaut ; `overrides` couvre les cas forgé / expiré / B.
async function token(overrides: Partial<TokenClaims> = {}): Promise<string> {
  return api.bearerToken({ userId: USER_A, workspaceId: WORKSPACE_A, ...overrides });
}

beforeAll(async () => {
  api = await startTestApi();
  tokenA = await token();
  tokenB = await token({ userId: USER_B, workspaceId: WORKSPACE_B });
});

afterAll(async () => {
  await api.close();
});

describe("accès refusé sans jeton valide", () => {
  it("refuse une requête sans Authorization en 401 UNAUTHENTICATED", async () => {
    const result = await api.request("/api/v1/tasks");

    expect(result.status).toBe(401);
    expect(unauthorizedBody(result)).toEqual({
      status: 401,
      code: "UNAUTHENTICATED",
      messageKey: "auth.missing_token",
    });
  });

  it("refuse un schéma autre que Bearer en 401", async () => {
    const result = await api.request("/api/v1/tasks", {
      authorization: `Basic ${tokenA.slice(7)}`,
    });

    expect(result.status).toBe(401);
    expect(unauthorizedBody(result).messageKey).toBe("auth.invalid_token");
  });

  it("refuse un jeton signé par un autre secret en 401", async () => {
    const forged = await token({ secret: OTHER_SECRET });

    const result = await api.request("/api/v1/tasks", { authorization: forged });

    expect(result.status).toBe(401);
    expect(unauthorizedBody(result).messageKey).toBe("auth.invalid_token");
  });

  it("distingue un jeton expiré (SESSION_EXPIRED) pour permettre le refresh", async () => {
    const expired = await token({ expiresIn: -10 });

    const result = await api.request("/api/v1/tasks", { authorization: expired });

    expect(result.status).toBe(401);
    expect(unauthorizedBody(result)).toMatchObject({
      code: "SESSION_EXPIRED",
      messageKey: "auth.session_expired",
    });
  });

  it("refuse un jeton sans claim workspaceId en 401", async () => {
    // `sub` présent, `workspaceId` absent : jeton bien signé mais inexploitable.
    const incomplete = await api.bearerToken({ userId: USER_A });

    const result = await api.request("/api/v1/tasks", { authorization: incomplete });

    expect(result.status).toBe(401);
    expect(unauthorizedBody(result).messageKey).toBe("auth.invalid_token");
  });

  it("laisse les sondes de santé publiques", async () => {
    const live = await api.request("/health");
    const ready = await api.request("/health/ready");

    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
  });
});

describe("cloisonnement avec deux jetons", () => {
  it("ne laisse pas un workspace lire la tâche d'un autre (404, jamais 403)", async () => {
    const created = taskSchema.parse(
      (
        await api.request("/api/v1/tasks", {
          method: "POST",
          authorization: tokenA,
          body: { title: "privée de A" },
        })
      ).body,
    );

    const foreignRead = await api.request(`/api/v1/tasks/${created.id}`, {
      authorization: tokenB,
    });

    expect(foreignRead.status).toBe(404);
    expect(problemDetailsSchema.parse(foreignRead.body).code).toBe("NOT_FOUND");
  });

  it("ignore un workspaceId fourni dans le corps : celui du jeton gagne", async () => {
    const created = taskSchema.parse(
      (
        await api.request("/api/v1/tasks", {
          method: "POST",
          authorization: tokenA,
          // Injection volontaire : ce champ ne doit jamais décider du scope.
          body: { title: "tentative de fuite", workspaceId: WORKSPACE_B },
        })
      ).body,
    );

    const listB = taskListResponseSchema.parse(
      (await api.request("/api/v1/tasks?limit=100", { authorization: tokenB })).body,
    );
    const listA = taskListResponseSchema.parse(
      (await api.request("/api/v1/tasks?limit=100", { authorization: tokenA })).body,
    );

    expect(listB.items.some((task) => task.id === created.id)).toBe(false);
    expect(listA.items.some((task) => task.id === created.id)).toBe(true);
  });

  it("refuse la mutation d'une tâche d'un autre workspace", async () => {
    const created = taskSchema.parse(
      (
        await api.request("/api/v1/tasks", {
          method: "POST",
          authorization: tokenA,
          body: { title: "à protéger" },
        })
      ).body,
    );

    const patched = await api.request(`/api/v1/tasks/${created.id}`, {
      method: "PATCH",
      authorization: tokenB,
      body: { title: "intrusion", version: 0 },
    });
    const deleted = await api.request(`/api/v1/tasks/${created.id}?version=0`, {
      method: "DELETE",
      authorization: tokenB,
    });

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);

    const untouched = taskSchema.parse(
      (await api.request(`/api/v1/tasks/${created.id}`, { authorization: tokenA })).body,
    );
    expect(untouched.title).toBe("à protéger");
    expect(untouched.version).toBe(0);
  });
});
