import { z } from "zod";
import { errorCodeSchema } from "./error-codes";

// RFC 9457 (ex-RFC 7807), cf. doc 01 N-8 : toutes les erreurs de l'API sortent
// avec ce corps et le type `application/problem+json`.
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export const problemDetailsSchema = z.object({
  // `about:blank` par défaut ; une URL de documentation peut le remplacer.
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().min(1).optional(),
  instance: z.string().min(1).optional(),
  code: errorCodeSchema,
  requestId: z.string().min(1).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
