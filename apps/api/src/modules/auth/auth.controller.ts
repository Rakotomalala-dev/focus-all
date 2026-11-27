import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type {
  AccountExport,
  AuthTokens,
  ConnectionListResponse,
  MeResponse,
  SessionListResponse,
} from "@focus/contracts";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "./auth-context";
import { AuthService } from "./auth.service";
import { CurrentAuth } from "./current-auth.decorator";
import { Public } from "./public.decorator";
import { sessionMetaFrom } from "./session-meta";

// Controller = transport uniquement (N-1) : validation et règles vivent dans
// le service. `@Public()` couvre les routes qui précèdent l'obtention d'un
// jeton ; tout le reste exige le guard global.
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @HttpCode(201)
  register(@Body() body: unknown, @Req() request: FastifyRequest): Promise<AuthTokens> {
    return this.auth.register(body, sessionMetaFrom(request));
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() body: unknown, @Req() request: FastifyRequest): Promise<AuthTokens> {
    return this.auth.login(body, sessionMetaFrom(request));
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() body: unknown, @Req() request: FastifyRequest): Promise<AuthTokens> {
    return this.auth.refresh(body, sessionMetaFrom(request));
  }

  // Réponse constante, y compris pour un e-mail inconnu (RF-02).
  @Public()
  @Post("password-reset/request")
  @HttpCode(202)
  requestPasswordReset(@Body() body: unknown): Promise<void> {
    return this.auth.requestPasswordReset(body);
  }

  @Public()
  @Post("password-reset/confirm")
  @HttpCode(204)
  confirmPasswordReset(@Body() body: unknown): Promise<void> {
    return this.auth.confirmPasswordReset(body);
  }

  @Post("password/change")
  @HttpCode(204)
  changePassword(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<void> {
    return this.auth.changePassword(auth, body);
  }

  @Get("sessions")
  sessions(@CurrentAuth() auth: AuthContext): Promise<SessionListResponse> {
    return this.auth.listSessions(auth);
  }

  @Get("connections")
  connections(@CurrentAuth() auth: AuthContext): Promise<ConnectionListResponse> {
    return this.auth.listConnections(auth);
  }

  // « Tout déconnecter » inclut la session courante : le client efface ensuite
  // ses jetons locaux.
  @Delete("sessions")
  @HttpCode(204)
  revokeAllSessions(@CurrentAuth() auth: AuthContext): Promise<void> {
    return this.auth.revokeAllSessions(auth);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ): Promise<void> {
    return this.auth.revokeSession(auth, id);
  }

  @Post("logout")
  @HttpCode(204)
  logout(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<void> {
    return this.auth.logout(auth, body);
  }
}

// `/me` n'appartient pas au préfixe `/auth` (doc 01 §10.3) : contrôleur racine,
// même service, aucune duplication de route.
@Controller()
export class MeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("me")
  me(@CurrentAuth() auth: AuthContext): Promise<MeResponse> {
    return this.auth.me(auth);
  }

  @Patch("me")
  updateMe(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<MeResponse> {
    return this.auth.updateProfile(auth, body);
  }

  // Confirmation forte : mot de passe + littéral « DELETE » (RF-06).
  @Delete("me")
  @HttpCode(204)
  deleteMe(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<void> {
    return this.auth.deleteAccount(auth, body);
  }

  @Get("me/export")
  exportMe(@CurrentAuth() auth: AuthContext): Promise<AccountExport> {
    return this.auth.exportAccount(auth);
  }
}
