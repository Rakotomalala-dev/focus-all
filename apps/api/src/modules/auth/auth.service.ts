import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import {
  loginInputSchema,
  logoutInputSchema,
  meResponseSchema,
  refreshInputSchema,
  registerInputSchema,
  type AuthTokens,
  type MeResponse,
} from "@focus/contracts";
import { APP_ENV } from "../../config/app-config.module";
import type { Env } from "../../config/env.schema";
import { DomainError } from "../../common/domain-error";
import { uuidV7 } from "../../common/uuid-v7";
import { describeIssues } from "../../common/zod-issues";
import { PrismaService } from "../../database/prisma.service";
import type { AuthContext } from "./auth-context";
import { PasswordHasher } from "./password-hasher";

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

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
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
      },
    });

    if (replacedSessionId !== undefined) {
      await this.prisma.session.update({
        where: { id: replacedSessionId },
        data: { replacedById: session.id },
      });
    }

    const accessToken = await this.jwt.signAsync(
      { workspaceId },
      { subject: userId, expiresIn: this.env.JWT_ACCESS_TTL },
    );

    return {
      tokenType: "Bearer",
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds(),
    };
  }

  async register(rawBody: unknown): Promise<AuthTokens> {
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
          data: { id: userId, email, passwordHash, displayName },
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

    return this.issueTokens(userId, workspaceId);
  }

  async login(rawBody: unknown): Promise<AuthTokens> {
    const parsed = loginInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const user = await this.prisma.user.findFirst({
      where: { email: parsed.data.email, deletedAt: null },
      select: { id: true, passwordHash: true },
    });

    // Même refus pour un e-mail inconnu et un mot de passe faux : aucun
    // oracle d'existence de compte (RF-02/RF-03).
    if (user === null || !(await this.passwords.verify(user.passwordHash, parsed.data.password))) {
      throw new DomainError("auth.invalid_credentials");
    }

    return this.issueTokens(user.id, await this.personalWorkspaceId(user.id));
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async refresh(rawBody: unknown): Promise<AuthTokens> {
    const parsed = refreshInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(parsed.data.refreshToken) },
      select: { id: true, userId: true, familyId: true, expiresAt: true, revokedAt: true },
    });

    if (session === null) {
      throw new DomainError("auth.invalid_refresh");
    }
    // Un token déjà consommé est le signe d'un vol : toute la famille tombe
    // (doc 03 §6.2).
    if (session.revokedAt !== null) {
      await this.revokeFamily(session.familyId);
      throw new DomainError("auth.session_revoked");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new DomainError("auth.session_expired");
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

    return this.issueTokens(
      session.userId,
      await this.personalWorkspaceId(session.userId),
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
      data: { revokedAt: new Date() },
    });
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: auth.userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        locale: true,
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
      timezone: user.timezone,
      locale: user.locale,
      workspaces: user.memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        isPersonal: membership.workspace.isPersonal,
        role: membership.role,
      })),
    });
  }
}
