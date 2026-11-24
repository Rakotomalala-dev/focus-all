import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DomainError } from "./domain-error";
import { codeForStatus, toProblem } from "./problem-details.filter";

const REQUEST = { url: "/api/v1/tasks/42", requestId: "req-1" };

describe("toProblem", () => {
  it("traduit une DomainError en statut, code et clé, sans `detail`", () => {
    const { status, problem } = toProblem(new DomainError("task.not_found"), REQUEST);

    expect(status).toBe(404);
    expect(problem.code).toBe("NOT_FOUND");
    expect(problem.title).toBe("Not Found");
    expect(problem.instance).toBe(REQUEST.url);
    expect(problem.requestId).toBe(REQUEST.requestId);
    expect(problem.messageKey).toBe("task.not_found");
    expect(problem.detail).toBeUndefined();
  });

  it("transmet les paramètres typés de la clé (version courante)", () => {
    const exception = new DomainError("task.version_precondition_failed", { currentVersion: 3 });

    const { status, problem } = toProblem(exception, REQUEST);

    expect(status).toBe(412);
    expect(problem.code).toBe("CONFLICT_VERSION");
    expect(problem.title).toBe("Precondition Failed");
    expect(problem.messageKey).toBe("task.version_precondition_failed");
    expect(problem.params).toEqual({ currentVersion: 3 });
  });

  it("mappe une exception HTTP hors domaine sur son statut, sans clé", () => {
    const { status, problem } = toProblem(new ConflictException(), REQUEST);

    expect(status).toBe(409);
    expect(problem.code).toBe("CONFLICT_VERSION");
    expect(problem.messageKey).toBeUndefined();
  });

  it("aplatit un tableau de messages de validation", () => {
    const exception = new BadRequestException({ message: ["title too short", "code too long"] });

    expect(toProblem(exception, REQUEST).problem.detail).toBe("title too short, code too long");
  });

  it("ne fuite aucun détail interne sur une erreur inattendue", () => {
    const { status, problem } = toProblem(new Error("connexion base refusée"), REQUEST);

    expect(status).toBe(500);
    expect(problem.code).toBe("INTERNAL");
    expect(problem.title).toBe("Internal Server Error");
    expect(problem.detail).toBeUndefined();
    expect(problem.messageKey).toBeUndefined();
  });

  it("retombe sur REQUEST_REJECTED pour un 4xx non mappé", () => {
    expect(codeForStatus(418)).toBe("REQUEST_REJECTED");
    expect(codeForStatus(503)).toBe("INTERNAL");
  });
});
