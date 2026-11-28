import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import {
  connectionListResponseSchema,
  deleteAccountSchema,
  loginInputSchema,
  logoutInputSchema,
  meResponseSchema,
  passwordChangeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  profileUpdateSchema,
  refreshInputSchema,
  registerInputSchema,
  sessionListResponseSchema,
  type AuthTokens,
  type ConnectionListResponse,
  type MeResponse,
  type SessionListResponse,
} from "@focus/contracts";
import { APP_ENV } from "../../config/app-config.module";
import type { Env } from "../../config/env.schema";
import { DomainError } from "../../common/domain-error";
import { uuidV7 } from "../../common/uuid-v7";
import { describeIssues } from "../../common/zod-issues";
import { PrismaService } from "../../database/prisma.service";
import type { AuthContext } from "./auth-context";
import { MAILER, type Mailer } from "./mailer";
import { PasswordHasher } from "./password-hasher";
import type { SessionMeta } from "./session-meta";

// `15m`/`30d` → secondes. Le format est validé par `env.schema` au démarrage,
// donc une valeur illisible ici est un bug de configuration, pas une entrée
// utilisateur.
function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (match === null) {
    throw new Error("Durée JWT invalide");
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86_400;
  return amount * factor;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Verrouillage progressif (RF-01) : 5 échecs → 1 min, 10 → 5 min, 15+ → 15 min.
const LOCK_DELAYS_SECONDS = [60, 300, 900] as const;
const MAX_FAILURES_BEFORE_LOCK = 5;
const RESET_TOKEN_TTL_MINUTES = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  private accessTtlSeconds(): number {
    return durationToSeconds(this.env.JWT_ACCESS_TTL);
  }

  private refreshTtlMs(): number {
    return durationToSeconds(this.env.JWT_REFRESH_TTL) * 1000;
  }

  // Le workspace du jeton est le workspace personnel créé à l'inscription
  // (RF-01) ; il vient de la base, jamais du client (N-3).
  private async personalWorkspaceId(userId: string): Promise<string> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspace: { isPersonal: true } },
      orderBy: { joinedAt: "asc" },
      select: { workspaceId: true },
    });
    if (membership === null) {
      throw new DomainError("auth.no_workspace");
    }
    return membership.workspaceId;
  }

  private async issueTokens(
    userId: string,
    workspaceId: string,
    meta: SessionMeta,
    existingFamilyId?: string,
    replacedSessionId?: string,
  ): Promise<AuthTokens> {
    const refreshToken = randomBytes(32).toString("base64url");
    const sessionId = uuidV7();

    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: sha256(refreshToken),
        familyId: existingFamilyId ?? uuidV7(),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        ...(meta.platform === undefined ? {} : { platform: meta.platform }),
        ...(meta.deviceName === undefined ? {} : { deviceName: meta.deviceName }),
        ...(meta.userAgent === undefined ? {} : { userAgent: meta.userAgent.slice(0, 512) }),
        ...(meta.ip === undefined ? {} : { ip: meta.ip }),
      },
    });

    if (replacedSessionId !== undefined) {
      await this.prisma.session.update({
        where: { id: replacedSessionId },
        data: { replacedById: session.id },
      });
    }

    const accessToken = await this.jwt.signAsync(
      // `sid` permet de révoquer « toutes les autres sessions » sans toucher à
      // celle qui effectue le changement de mot de passe (RF-70).
      { workspaceId, sid: sessionId },
      { subject: userId, expiresIn: this.env.JWT_ACCESS_TTL },
    );

    return {
      tokenType: "Bearer",
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds(),
    };
  }

  async register(rawBody: unknown, meta: SessionMeta = {}): Promise<AuthTokens> {
    const parsed = registerInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const { email, password } = parsed.data;
    const displayName = parsed.data.displayName ?? email.split("@")[0] ?? "Focus";
    const passwordHash = await this.passwords.hash(password);

    const userId = uuidV7();
    const workspaceId = uuidV7();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email,
            passwordHash,
            displayName,
            ...(parsed.data.timezone === undefined ? {} : { timezone: parsed.data.timezone }),
          },
        });
        await tx.workspace.create({
          data: {
            id: workspaceId,
            name: `Espace de ${displayName}`,
            ownerId: userId,
            isPersonal: true,
          },
        });
        await tx.workspaceMember.create({
          data: { workspaceId, userId, role: "OWNER" },
        });
      }, { maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      // L'unicité est portée par la base (`citext`) : la vérifier puis insérer
      // laisserait une course entre deux inscriptions simultanées.
      if (isUniqueViolation(error)) {
        throw new DomainError("auth.email_taken");
      }
      throw error;
    }

    return this.issueTokens(userId, workspaceId, meta);
  }

  private async lockedRetrySeconds(email: string): Promise<number | null> {
    const attempt = await this.prisma.loginAttempt.findUnique({ where: { email } });
    if (attempt?.lockedUntil === null || attempt?.lockedUntil === undefined) {
      return null;
    }
    const remaining = attempt.lockedUntil.getTime() - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : null;
  }

  // Enregistre un échec et applique le palier suivant. Une fois le palier
  // atteint, l'erreur 429 porte le délai restant, jamais un texte libre.
  private async recordFailure(email: string): Promise<number | null> {
    const previous = await this.prisma.loginAttempt.findUnique({ where: { email } });
    const failedCount = (previous?.failedCount ?? 0) + 1;
    const reachedLock = failedCount % MAX_FAILURES_BEFORE_LOCK === 0;
    const lockLevel = reachedLock
      ? Math.min((previous?.lockLevel ?? 0) + 1, LOCK_DELAYS_SECONDS.length)
      : (previous?.lockLevel ?? 0);
    const delaySeconds = reachedLock
      ? (LOCK_DELAYS_SECONDS[Math.min(lockLevel - 1, LOCK_DELAYS_SECONDS.length - 1)] ?? 60)
      : null;
    const lockedUntil =
      delaySeconds === null ? null : new Date(Date.now() + delaySeconds * 1000);

    await this.prisma.loginAttempt.upsert({
      where: { email },
      create: {
        email,
        failedCount,
        lockLevel,
        ...(lockedUntil === null ? {} : { lockedUntil }),
      },
      update: {
        failedCount,
        lockLevel,
        lockedUntil,
        lastFailedAt: new Date(),
      },
    });

    return delaySeconds;
  }

  async login(rawBody: unknown, meta: SessionMeta = {}): Promise<AuthTokens> {
    const parsed = loginInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const { email } = parsed.data;
    const retryAfter = await this.lockedRetrySeconds(email);
    if (retryAfter !== null) {
      throw new DomainError("auth.too_many_attempts", { retryAfterSeconds: retryAfter });
    }

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, passwordHash: true },
    });

    // Même refus pour un e-mail inconnu et un mot de passe faux : aucun
    // oracle d'existence de compte (RF-02/RF-03).
    if (user === null || !(await this.passwords.verify(user.passwordHash, parsed.data.password))) {
      const delay = await this.recordFailure(email);
      if (delay !== null) {
        throw new DomainError("auth.too_many_attempts", { retryAfterSeconds: delay });
      }
      throw new DomainError("auth.invalid_credentials");
    }

    await this.prisma.loginAttempt.deleteMany({ where: { email } });

    return this.issueTokens(
      user.id,
      await this.personalWorkspaceId(user.id),
      {
        ...meta,
        ...(parsed.data.deviceName === undefined ? {} : { deviceName: parsed.data.deviceName }),
      },
    );
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async refresh(rawBody: unknown, meta: SessionMeta = {}): Promise<AuthTokens> {
    const parsed = refreshInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(parsed.data.refreshToken) },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        platform: true,
        deviceName: true,
        userAgent: true,
        ip: true,
        user: { select: { deletedAt: true } },
      },
    });

    if (session === null) {
      throw new DomainError("auth.invalid_refresh");
    }
    // Un token déjà consommé est le signe d'un vol : toute la famille tombe
    // (doc 03 §6.2) et l'événement est journalisé sans donnée personnelle.
    if (session.revokedAt !== null) {
      this.logger.warn(
        `Réutilisation de refresh token : userId=${session.userId} familyId=${session.familyId}`,
      );
      await this.revokeFamily(session.familyId);
      throw new DomainError("auth.session_revoked");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new DomainError("auth.session_expired");
    }
    if (session.user.deletedAt !== null) {
      await this.revokeFamily(session.familyId);
      throw new DomainError("auth.session_revoked");
    }

    // Rotation conditionnelle : deux refresh simultanés ne peuvent pas créer
    // deux successeurs, le second révoque la famille.
    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    if (revoked.count === 0) {
      await this.revokeFamily(session.familyId);
      throw new DomainError("auth.session_revoked");
    }

    const platform = meta.platform ?? session.platform;
    const deviceName = meta.deviceName ?? session.deviceName;
    const userAgent = meta.userAgent ?? session.userAgent;
    const ip = meta.ip ?? session.ip;

    return this.issueTokens(
      session.userId,
      await this.personalWorkspaceId(session.userId),
      {
        ...(platform === null || platform === undefined ? {} : { platform }),
        ...(deviceName === null || deviceName === undefined ? {} : { deviceName }),
        ...(userAgent === null || userAgent === undefined ? {} : { userAgent }),
        ...(ip === null || ip === undefined ? {} : { ip }),
      },
      session.familyId,
      session.id,
    );
  }

  async logout(auth: AuthContext, rawBody: unknown): Promise<void> {
    const parsed = logoutInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    await this.prisma.session.updateMany({
      where: {
        userId: auth.userId,
        refreshTokenHash: sha256(parsed.data.refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
  }

  private async loadMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        timezone: true,
        locale: true,
        weekStartsOn: true,
        timeFormat: true,
        theme: true,
        quickAddParsingEnabled: true,
        telemetryEnabled: true,
        memberships: {
          select: {
            role: true,
            workspace: { select: { id: true, name: true, isPersonal: true } },
          },
        },
      },
    });

    if (user === null) {
      throw new DomainError("auth.invalid_token");
    }

    return meResponseSchema.parse({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      locale: user.locale,
      weekStartsOn: user.weekStartsOn,
      timeFormat: user.timeFormat,
      theme: user.theme,
      quickAddParsingEnabled: user.quickAddParsingEnabled,
      telemetryEnabled: user.telemetryEnabled,
      workspaces: user.memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        isPersonal: membership.workspace.isPersonal,
        role: membership.role,
      })),
    });
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    return this.loadMe(auth.userId);
  }

  // Utilisé par l'export asynchrone (RF-71), qui n'a pas de contexte de
  // workspace : le snapshot ne contient que l'identité et les espaces.
  async meForUser(userId: string): Promise<MeResponse> {
    return this.loadMe(userId);
  }

  async updateProfile(auth: AuthContext, rawBody: unknown): Promise<MeResponse> {
    const parsed = profileUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    // `exactOptionalPropertyTypes` interdit de transmettre une clé à
    // `undefined` : seuls les champs réellement fournis sont écrits.
    const data = {
      ...(parsed.data.displayName === undefined ? {} : { displayName: parsed.data.displayName }),
      ...(parsed.data.avatarUrl === undefined ? {} : { avatarUrl: parsed.data.avatarUrl }),
      ...(parsed.data.timezone === undefined ? {} : { timezone: parsed.data.timezone }),
      ...(parsed.data.locale === undefined ? {} : { locale: parsed.data.locale }),
      ...(parsed.data.weekStartsOn === undefined ? {} : { weekStartsOn: parsed.data.weekStartsOn }),
      ...(parsed.data.timeFormat === undefined ? {} : { timeFormat: parsed.data.timeFormat }),
      ...(parsed.data.theme === undefined ? {} : { theme: parsed.data.theme }),
      ...(parsed.data.quickAddParsingEnabled === undefined
        ? {}
        : { quickAddParsingEnabled: parsed.data.quickAddParsingEnabled }),
      ...(parsed.data.telemetryEnabled === undefined
        ? {}
        : { telemetryEnabled: parsed.data.telemetryEnabled }),
    };
    const updated = await this.prisma.user.updateMany({
      where: { id: auth.userId, deletedAt: null },
      data,
    });
    if (updated.count === 0) {
      throw new DomainError("auth.invalid_token");
    }

    return this.loadMe(auth.userId);
  }

  async changePassword(auth: AuthContext, rawBody: unknown): Promise<void> {
    const parsed = passwordChangeSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const user = await this.prisma.user.findFirst({
      where: { id: auth.userId, deletedAt: null },
      select: { passwordHash: true },
    });
    if (user === null) {
      throw new DomainError("auth.invalid_token");
    }
    if (!(await this.passwords.verify(user.passwordHash, parsed.data.currentPassword))) {
      throw new DomainError("auth.current_password_invalid");
    }

    const passwordHash = await this.passwords.hash(parsed.data.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: auth.userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: {
          userId: auth.userId,
          revokedAt: null,
          ...(auth.sessionId === undefined ? {} : { id: { not: auth.sessionId } }),
        },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // Réponse toujours `202` : l'existence du compte n'est jamais révélée, et un
  // échec d'envoi ne doit pas se distinguer d'un succès.
  async requestPasswordReset(rawBody: unknown): Promise<void> {
    const parsed = passwordResetRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const user = await this.prisma.user.findFirst({
      where: { email: parsed.data.email, deletedAt: null },
      select: { id: true, email: true },
    });
    if (user === null) {
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
    const link = `${this.env.APP_PUBLIC_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.create({
        data: {
          id: uuidV7(),
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt,
        },
      }),
    ]);

    try {
      await this.mailer.sendPasswordReset({
        to: user.email,
        link,
        expiresMinutes: RESET_TOKEN_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `Envoi du lien de réinitialisation impossible (userId=${user.id})`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async confirmPasswordReset(rawBody: unknown): Promise<void> {
    const parsed = passwordResetConfirmSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const now = new Date();
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(parsed.data.token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { deletedAt: true } },
      },
    });

    if (
      record === null ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= now.getTime() ||
      record.user.deletedAt !== null
    ) {
      throw new DomainError("auth.invalid_reset_token");
    }

    const passwordHash = await this.passwords.hash(parsed.data.password);
    await this.prisma.$transaction(async (tx) => {
      // Consommation conditionnelle : deux confirmations simultanées ne
      // peuvent pas réutiliser le même jeton.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count === 0) {
        throw new DomainError("auth.invalid_reset_token");
      }

      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      });
    });
  }

  async deleteAccount(auth: AuthContext, rawBody: unknown): Promise<void> {
    const parsed = deleteAccountSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const user = await this.prisma.user.findFirst({
      where: { id: auth.userId, deletedAt: null },
      select: { passwordHash: true, email: true },
    });
    if (user === null) {
      throw new DomainError("auth.invalid_token");
    }
    if (!(await this.passwords.verify(user.passwordHash, parsed.data.password))) {
      throw new DomainError("auth.current_password_invalid");
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: auth.userId },
        data: { deletedAt: now, deletionRequestedAt: now },
      }),
      this.prisma.session.updateMany({
        where: { userId: auth.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: auth.userId } }),
    ]);

    try {
      await this.mailer.sendAccountDeleted({ to: user.email });
    } catch (error) {
      this.logger.error(
        `Confirmation de suppression impossible (userId=${auth.userId})`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async listSessions(auth: AuthContext): Promise<SessionListResponse> {
    const now = new Date();
    const sessions = await this.prisma.session.findMany({
      where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: "desc" },
    });

    return sessionListResponseSchema.parse({
      items: sessions.map((session) => ({
        id: session.id,
        current: session.id === auth.sessionId,
        platform: session.platform,
        deviceName: session.deviceName,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      })),
    });
  }

  // Une ligne par famille : la rotation crée une session technique à chaque
  // refresh, elle ne doit pas apparaître comme un nouvel appareil.
  async listConnections(auth: AuthContext): Promise<ConnectionListResponse> {
    const rows = await this.prisma.session.findMany({
      where: { userId: auth.userId },
      orderBy: { lastUsedAt: "desc" },
      take: 100,
    });

    const byFamily = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!byFamily.has(row.familyId)) {
        byFamily.set(row.familyId, row);
      }
    }

    const now = Date.now();
    const items = [...byFamily.values()]
      .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
      .map((session) => ({
        id: session.id,
        current: session.id === auth.sessionId,
        platform: session.platform,
        deviceName: session.deviceName,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        active: session.revokedAt === null && session.expiresAt.getTime() > now,
        revokedAt: session.revokedAt?.toISOString() ?? null,
      }));

    return connectionListResponseSchema.parse({ items });
  }

  async revokeSession(auth: AuthContext, sessionId: string): Promise<void> {
    const revoked = await this.prisma.session.updateMany({
      where: { id: sessionId, userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new DomainError("auth.session_not_found");
    }
  }

  // Révoque toutes les sessions, y compris celle qui appelle : le client doit
  // se reconnecter (comportement explicite de « tout déconnecter »).
  async revokeAllSessions(auth: AuthContext): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
