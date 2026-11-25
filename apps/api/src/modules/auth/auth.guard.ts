import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { uuidSchema } from "@focus/contracts";
import { DomainError } from "../../common/domain-error";
import type { AuthContext, AuthenticatedRequest } from "./auth-context";
import { IS_PUBLIC_KEY } from "./public.decorator";

// `Authorization` doit porter exactement un schéma Bearer et un jeton : plusieurs
// valeurs ou un autre schéma sont un refus, pas une tentative de secours.
function requireBearerToken(header: string | undefined): string {
  if (header === undefined) {
    throw new DomainError("auth.missing_token");
  }
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0) {
    throw new DomainError("auth.invalid_token");
  }
  if (rest.length > 0) {
    throw new DomainError("auth.invalid_token");
  }
  return token;
}

// jsonwebtoken signale l'expiration par un type d'erreur dédié : le client doit
// pouvoir distinguer « reconnecte-toi » (401 SESSION_EXPIRED) d'un jeton forgé.
function isExpired(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TokenExpiredError"
  );
}

// Les claims utiles sont validés comme UUID avant tout accès : un jeton bien
// signé mais mal formé ne doit pas produire un workspace arbitraire.
function toAuthContext(payload: Record<string, unknown>): AuthContext | undefined {
  const userId = uuidSchema.safeParse(payload.sub);
  const workspaceId = uuidSchema.safeParse(payload.workspaceId);
  if (!userId.success || !workspaceId.success) {
    return undefined;
  }
  return { userId: userId.data, workspaceId: workspaceId.data };
}

// Guard global (APP_GUARD) : toute route est authentifiée sauf `@Public()`.
// Le workspace de la requête vient du jeton signé, ce qui rend impossible de
// le choisir depuis le corps ou la query (N-3/S-2).
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = requireBearerToken(request.headers.authorization);

    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch (error) {
      throw isExpired(error)
        ? new DomainError("auth.session_expired")
        : new DomainError("auth.invalid_token");
    }

    const auth = toAuthContext(payload);
    if (auth === undefined) {
      throw new DomainError("auth.invalid_token");
    }

    request.auth = auth;
    return true;
  }
}
