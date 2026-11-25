import { z } from "zod";

// Configuration d'environnement de l'API : une seule source typée, validée au
// démarrage (doc 03 §4, R4). Ne déclarer ici qu'une variable réellement lue par
// le code ; une variable documentée mais inutilisée n'a pas sa place dans le
// schéma (O9).
const emptyAsUndefined = (value: unknown): unknown =>
  value === undefined || value === "" ? undefined : value;

// Une valeur vide retombe sur le défaut ; une valeur non numérique échoue au
// démarrage au lieu de faire écouter l'API sur un port arbitraire.
const portSchema = z.preprocess(
  emptyAsUndefined,
  z.coerce.number().int().min(1).max(65_535).default(4000),
);

// CORS : liste explicite séparée par des virgules, jamais une origine
// permissive par défaut (doc 03 §4.2).
const corsOriginsSchema = z.preprocess(
  emptyAsUndefined,
  z
    .string()
    .default("http://localhost:8081")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: portSchema,
  API_PREFIX: z.string().startsWith("/", "Le préfixe doit commencer par « / »").default("/api/v1"),
  CORS_ORIGINS: corsOriginsSchema,
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "Le secret doit contenir au moins 32 caractères (doc 03 §4.2)"),
  JWT_ACCESS_TTL: z.string().min(1).default("15m"),
  JWT_ISSUER: z.string().min(1).default("focus-api"),
  JWT_AUDIENCE: z.string().min(1).default("focus-clients"),
});

export type Env = z.output<typeof envSchema>;

// Le message ne recopie jamais une valeur reçue : il ne doit pas y avoir de
// secret dans un log de démarrage (S-5/S-12), même en cas d'échec.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join(" ; ");
    throw new Error(`Environnement invalide — ${details}`);
  }
  return parsed.data;
}
