import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { codeForStatus, toProblem } from "./problem-details.filter";

const REQUEST = { url: "/api/v1/tasks/42", requestId: "req-1" };

describe("toProblem", () => {
  it("mappe une 404 sur NOT_FOUND avec instance et requestId", () => {
    const { status, problem } = toProblem(new NotFoundException("Tâche introuvable"), REQUEST);

    expect(status).toBe(404);
    expect(problem.code).toBe("NOT_FOUND");
    expect(problem.title).toBe("Not Found");
    expect(problem.instance).toBe(REQUEST.url);
    expect(problem.requestId).toBe(REQUEST.requestId);
    expect(problem.detail).toBe("Tâche introuvable");
  });

  it("mappe une 409 sur CONFLICT_VERSION (contrôle optimiste)", () => {
    const { status, problem } = toProblem(new ConflictException(), REQUEST);

    expect(status).toBe(409);
    expect(problem.code).toBe("CONFLICT_VERSION");
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
  });

  it("mappe 412 sur CONFLICT_VERSION (If-Match non satisfait)", () => {
    const { status, problem } = toProblem(new HttpException(["version obsolète"], 412), REQUEST);

    expect(status).toBe(412);
    expect(problem.code).toBe("CONFLICT_VERSION");
    expect(problem.title).toBe("Precondition Failed");
    expect(problem.detail).toBe("version obsolète");
  });

  it("retombe sur REQUEST_REJECTED pour un 4xx non mappé", () => {
    expect(codeForStatus(418)).toBe("REQUEST_REJECTED");
    expect(codeForStatus(503)).toBe("INTERNAL");
  });
});
