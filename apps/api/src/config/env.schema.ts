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
  // Format `<nombre><s|m|h|d>` : la durée est convertie en secondes par le
  // service d'authentification, jamais interprétée à la volée.
  JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]$/, "Durée attendue : 15m, 30d…").default("15m"),
  JWT_REFRESH_TTL: z.string().regex(/^\d+[smhd]$/, "Durée attendue : 15m, 30d…").default("30d"),
  JWT_ISSUER: z.string().min(1).default("focus-api"),
  JWT_AUDIENCE: z.string().min(1).default("focus-clients"),
  // Coûts Argon2id (doc 01 §15) : bornes basses pour qu'une valeur fautive
  // n'affaiblisse pas silencieusement le hachage.
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8 * 1024).default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).max(10).default(2),
  // Livraison des e-mails de sécurité (RF-02/RF-06). Sans `SMTP_URL`, le
  // service journalise un avertissement et n'envoie rien : jamais de jeton en
  // clair dans les logs (S-5).
  SMTP_URL: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  MAIL_FROM: z.string().min(1).default("Focus <no-reply@focus.local>"),
  // Base des liens envoyés par e-mail (web/PWA).
  APP_PUBLIC_URL: z.preprocess(
    emptyAsUndefined,
    z.string().url().default("http://localhost:8081"),
  ),
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
