import { z } from "zod";
import { uuidSchema } from "./task";

// RF-01 : mot de passe de 10 caractères minimum. La borne haute évite qu'un
// corps démesuré ne coûte un hachage Argon2id inutile.
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

// E-mail normalisé une seule fois, côté schéma : l'unicité `citext` en base et
// la comparaison applicative ne peuvent pas diverger.
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});

export type RegisterInput = z.output<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type LoginInput = z.output<typeof loginInputSchema>;

// Le refresh token est opaque (32 octets aléatoires encodés) : sa forme est
// seulement bornée, jamais interprétée.
export const refreshTokenSchema = z.string().min(20).max(200);

export const refreshInputSchema = z.object({ refreshToken: refreshTokenSchema });
export type RefreshInput = z.output<typeof refreshInputSchema>;

export const logoutInputSchema = refreshInputSchema;
export type LogoutInput = z.output<typeof logoutInputSchema>;

export const authTokensSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  // Durée de vie de l'access token, en secondes : le client planifie le
  // rafraîchissement sans décoder le JWT.
  expiresIn: z.number().int().positive(),
});

export type AuthTokens = z.output<typeof authTokensSchema>;

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const meWorkspaceSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  isPersonal: z.boolean(),
  role: workspaceRoleSchema,
});

export type MeWorkspace = z.output<typeof meWorkspaceSchema>;

export const meResponseSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string().min(1),
  timezone: z.string().min(1),
  locale: z.string().min(1),
  workspaces: z.array(meWorkspaceSchema),
});

export type MeResponse = z.output<typeof meResponseSchema>;
