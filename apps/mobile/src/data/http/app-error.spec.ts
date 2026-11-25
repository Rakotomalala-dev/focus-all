import { describe, expect, it } from "vitest";
import { AppError, appErrorMessageKey, toAppError } from "./app-error";

const PROBLEM = {
  type: "about:blank",
  title: "Unauthenticated",
  status: 401,
  code: "UNAUTHENTICATED",
};

describe("toAppError", () => {
  it("traduit un problem+json en erreur typée", () => {
    const error = toAppError({
      isAxiosError: true,
      response: { status: 401, data: PROBLEM },
    });

    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.status).toBe(401);
    expect(appErrorMessageKey(error)).toBe("errors.UNAUTHENTICATED");
  });

  it("distingue une coupure réseau", () => {
    const error = toAppError({ isAxiosError: true });

    expect(error.isNetworkError).toBe(true);
    expect(appErrorMessageKey(error)).toBe("errors.network");
  });

  it("ne fait pas confiance à une réponse hors contrat", () => {
    const error = toAppError({
      isAxiosError: true,
      response: { status: 502, data: { html: "<html>" } },
    });

    expect(error.code).toBeNull();
    expect(appErrorMessageKey(error)).toBe("errors.unknown");
  });

  it("laisse passer une erreur déjà normalisée", () => {
    const error = new AppError({ code: "CONFLICT_VERSION", status: 409 });

    expect(toAppError(error)).toBe(error);
    expect(appErrorMessageKey(error)).toBe("errors.CONFLICT_VERSION");
  });

  it("rend une erreur inattendue neutre", () => {
    expect(appErrorMessageKey(new Error("boom"))).toBe("errors.unknown");
  });
});
