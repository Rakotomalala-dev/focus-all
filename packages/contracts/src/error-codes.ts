import { z } from "zod";

// Codes d'erreur stables et publics (doc 01, N-8) : c'est le seul élément
// qu'un client peut tester, le message restant destiné aux humains.
// TS-3 : pas d'`enum` TypeScript, `as const` + `z.enum`.
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  // Jeton d'accès expiré : le client tente un refresh, contrairement à un
  // jeton absent ou invalide qui impose une reconnexion (doc 03 §6.2).
  "SESSION_EXPIRED",
  // Refresh token déjà consommé : la famille de sessions a été révoquée.
  "SESSION_REVOKED",
  "FORBIDDEN",
  "NOT_FOUND",
  "REQUEST_REJECTED",
  "CONFLICT_VERSION",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
