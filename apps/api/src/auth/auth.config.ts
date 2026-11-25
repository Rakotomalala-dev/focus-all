// Configuration JWT de l'API (doc 03 §4.2). Validation au démarrage : un secret
// absent ou trop court empêche le boot (fail-fast, R4) au lieu de laisser
// l'API démarrer sans pouvoir vérifier un seul jeton.
export type AuthConfig = {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTtl: string;
};

const MIN_SECRET_LENGTH = 32;
const DEFAULT_ISSUER = "focus-api";
const DEFAULT_AUDIENCE = "focus-clients";
const DEFAULT_ACCESS_TTL = "15m";

export function resolveAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const secret = env.JWT_ACCESS_SECRET;
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_ACCESS_SECRET absent ou plus court que ${MIN_SECRET_LENGTH} caractères — voir doc 03 §4.2`,
    );
  }

  return {
    secret,
    issuer: env.JWT_ISSUER ?? DEFAULT_ISSUER,
    audience: env.JWT_AUDIENCE ?? DEFAULT_AUDIENCE,
    accessTtl: env.JWT_ACCESS_TTL ?? DEFAULT_ACCESS_TTL,
  };
}
