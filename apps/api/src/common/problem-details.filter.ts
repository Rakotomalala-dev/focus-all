import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { PROBLEM_CONTENT_TYPE, type ErrorCode, type ProblemDetails } from "@focus/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

// Table explicite plutôt qu'une déduction : un code stable est un contrat
// public, il ne doit pas dépendre d'une heuristique (doc 01, N-8).
const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: "VALIDATION_FAILED",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "VALIDATION_FAILED",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHENTICATED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT_VERSION",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
};

const TITLE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "Bad Request",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "Unprocessable Entity",
  [HttpStatus.UNAUTHORIZED]: "Unauthorized",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "Not Found",
  [HttpStatus.CONFLICT]: "Conflict",
  [HttpStatus.TOO_MANY_REQUESTS]: "Too Many Requests",
};

export type RequestInfo = {
  readonly url: string;
  readonly requestId: string;
};

export type ProblemResponse = {
  readonly status: number;
  readonly problem: ProblemDetails;
};

export function codeForStatus(status: number): ErrorCode {
  const known = CODE_BY_STATUS[status];
  if (known !== undefined) {
    return known;
  }
  // 5xx et tout statut non mappé : jamais de détail interne exposé.
  return status >= 500 ? "INTERNAL" : "REQUEST_REJECTED";
}

export function titleForStatus(status: number): string {
  return TITLE_BY_STATUS[status] ?? (status >= 500 ? "Internal Server Error" : "Request Rejected");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// `detail` ne doit jamais laisser fuir un message interne sur une 5xx (N-7).
function detailFor(exception: unknown, status: number): string | undefined {
  if (status >= 500 || !(exception instanceof HttpException)) {
    return undefined;
  }
  const response = exception.getResponse();
  if (typeof response === "string") {
    return response.length > 0 ? response : undefined;
  }
  if (!isRecord(response)) {
    return undefined;
  }
  const message = response.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  if (Array.isArray(message)) {
    const parts = message.filter((item): item is string => typeof item === "string");
    return parts.length > 0 ? parts.join(", ") : undefined;
  }
  return undefined;
}

export function toProblem(exception: unknown, request: RequestInfo): ProblemResponse {
  const status =
    exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

  const detail = detailFor(exception, status);
  const problem: ProblemDetails = {
    type: "about:blank",
    title: titleForStatus(status),
    status,
    code: codeForStatus(status),
    instance: request.url,
    requestId: request.requestId,
    // `exactOptionalPropertyTypes` interdit d'assigner `undefined` à une clé
    // optionnelle : la clé est ajoutée seulement quand un détail existe.
    ...(detail === undefined ? {} : { detail }),
  };

  return { status, problem };
}

// Filtre global : toute exception sort au format `application/problem+json`.
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const { status, problem } = toProblem(exception, { url: request.url, requestId: request.id });

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} (${problem.code}) requestId=${request.id}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    void reply.status(status).header("content-type", PROBLEM_CONTENT_TYPE).send(problem);
  }
}
