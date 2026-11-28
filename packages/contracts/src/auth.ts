import { z } from "zod";
import { uuidSchema } from "./task";

// RF-01 : mot de passe de 10 caractères minimum. La borne haute évite qu'un
// corps démesuré ne coûte un hachage Argon2id inutile. La robustesse impose au
// moins deux classes de caractères : un mot de passe tout en minuscules ou
// entièrement numérique est refusé, sans imposer une composition rigide.
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

function hasTwoCharacterClasses(value: string): boolean {
  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/[0-9]/.test(value)) classes += 1;
  if (/[^A-Za-z0-9]/.test(value)) classes += 1;
  return classes >= 2;
}

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .max(MAX_PASSWORD_LENGTH)
  .refine(hasTwoCharacterClasses, {
    message: "Le mot de passe doit mélanger au moins deux types de caractères.",
  });

// Fuseau IANA validé par la plateforme : une chaîne libre ferait échouer les
// calculs de date côté client, loin de la requête fautive.
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Fuseau IANA inconnu." },
  );

export const localeSchema = z.enum(["fr", "en"]);
export const weekStartSchema = z.enum(["MONDAY", "SUNDAY"]);
export const timeFormatSchema = z.enum(["H24", "H12"]);
export const themePreferenceSchema = z.enum(["LIGHT", "DARK", "SYSTEM"]);

export type WeekStart = z.output<typeof weekStartSchema>;
export type TimeFormat = z.output<typeof timeFormatSchema>;
export type ThemePreference = z.output<typeof themePreferenceSchema>;

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  // Détection initiale côté client (RF-04) ; le serveur a un défaut sûr.
  timezone: timezoneSchema.optional(),
});

export type RegisterInput = z.output<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  // Nom lisible de l'appareil, affiché dans les sessions (RF-03).
  deviceName: z.string().trim().min(1).max(80).optional(),
});

export type LoginInput = z.output<typeof loginInputSchema>;

export const refreshTokenSchema = z.string().min(20).max(200);

export const refreshInputSchema = z.object({ refreshToken: refreshTokenSchema });
export type RefreshInput = z.output<typeof refreshInputSchema>;

export const logoutInputSchema = refreshInputSchema;
export type LogoutInput = z.output<typeof logoutInputSchema>;

export const authTokensSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
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
  avatarUrl: z.string().url().nullable(),
  timezone: z.string().min(1),
  locale: localeSchema,
  weekStartsOn: weekStartSchema,
  timeFormat: timeFormatSchema,
  theme: themePreferenceSchema,
  quickAddParsingEnabled: z.boolean(),
  // RF-72 : opt-in explicite, désactivé par défaut.
  telemetryEnabled: z.boolean(),
  workspaces: z.array(meWorkspaceSchema),
});

export type MeResponse = z.output<typeof meResponseSchema>;

// PATCH /me : tous les champs sont optionnels, mais un corps vide est refusé
// (aucune écriture inutile ne doit produire un `updatedAt`).
export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
    timezone: timezoneSchema.optional(),
    locale: localeSchema.optional(),
    weekStartsOn: weekStartSchema.optional(),
    timeFormat: timeFormatSchema.optional(),
    theme: themePreferenceSchema.optional(),
    quickAddParsingEnabled: z.boolean().optional(),
    telemetryEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export type ProfileUpdate = z.output<typeof profileUpdateSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: passwordSchema,
});

export type PasswordChange = z.output<typeof passwordChangeSchema>;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequest = z.output<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(32).max(200),
  password: passwordSchema,
});

export type PasswordResetConfirm = z.output<typeof passwordResetConfirmSchema>;

// Confirmation forte (RF-06) : le mot de passe est revérifié et le client doit
// envoyer un littéral stable, jamais une simple pression sur un bouton.
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  confirmation: z.literal("DELETE"),
});

export type DeleteAccount = z.output<typeof deleteAccountSchema>;

export const sessionSchema = z.object({
  id: uuidSchema,
  current: z.boolean(),
  platform: z.string().nullable(),
  deviceName: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type AuthSession = z.output<typeof sessionSchema>;

export const sessionListResponseSchema = z.object({
  items: z.array(sessionSchema),
});

export type SessionListResponse = z.output<typeof sessionListResponseSchema>;

// Historique des connexions : une entrée par famille de sessions (les rotations
// ne doivent pas produire une ligne par refresh).
export const connectionSchema = sessionSchema.extend({
  active: z.boolean(),
  revokedAt: z.string().datetime().nullable(),
});

export type AuthConnection = z.output<typeof connectionSchema>;

export const connectionListResponseSchema = z.object({
  items: z.array(connectionSchema),
});

export type ConnectionListResponse = z.output<typeof connectionListResponseSchema>;
