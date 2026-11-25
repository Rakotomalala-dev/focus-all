import { problemDetailsSchema, type ErrorCode } from "@focus/contracts";
import axios from "axios";

// Le client ne manipule jamais un message serveur brut : chaque code stable
// (RFC 9457) a une clé de catalogue, et le rendu passe par `t(...)` (doc 03 §6.4).
export const ERROR_MESSAGE_KEYS = {
  VALIDATION_FAILED: "errors.VALIDATION_FAILED",
  UNAUTHENTICATED: "errors.UNAUTHENTICATED",
  SESSION_EXPIRED: "errors.SESSION_EXPIRED",
  FORBIDDEN: "errors.FORBIDDEN",
  NOT_FOUND: "errors.NOT_FOUND",
  REQUEST_REJECTED: "errors.REQUEST_REJECTED",
  CONFLICT_VERSION: "errors.CONFLICT_VERSION",
  RATE_LIMITED: "errors.RATE_LIMITED",
  INTERNAL: "errors.INTERNAL",
} as const satisfies Record<ErrorCode, string>;

export type AppErrorMessageKey =
  (typeof ERROR_MESSAGE_KEYS)[ErrorCode] | "errors.network" | "errors.unknown";

export type AppErrorOptions = {
  readonly code?: ErrorCode;
  readonly status?: number;
  readonly isNetworkError?: boolean;
  readonly requestId?: string;
};

// Erreur unique présentée à l'UI : soit un problem+json du serveur, soit un
// échec réseau, soit une réponse hors contrat. Aucun message brut ne circule.
export class AppError extends Error {
  readonly code: ErrorCode | null;
  readonly status: number | null;
  readonly isNetworkError: boolean;
  readonly requestId: string | null;

  constructor(options: AppErrorOptions = {}) {
    super(options.code ?? "AppError");
    this.name = "AppError";
    this.code = options.code ?? null;
    this.status = options.status ?? null;
    this.isNetworkError = options.isNetworkError ?? false;
    this.requestId = options.requestId ?? null;
  }
}

export function appErrorMessageKey(error: unknown): AppErrorMessageKey {
  if (!(error instanceof AppError)) {
    return "errors.unknown";
  }
  if (error.isNetworkError) {
    return "errors.network";
  }
  return error.code === null ? "errors.unknown" : ERROR_MESSAGE_KEYS[error.code];
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (!axios.isAxiosError(error)) {
    return new AppError();
  }

  const { response } = error;
  if (response === undefined) {
    return new AppError({ isNetworkError: true });
  }

  const problem = problemDetailsSchema.safeParse(response.data);
  if (!problem.success) {
    return new AppError({ status: response.status });
  }

  const { requestId } = problem.data;
  return new AppError({
    code: problem.data.code,
    status: problem.data.status,
    ...(requestId === undefined ? {} : { requestId }),
  });
}
