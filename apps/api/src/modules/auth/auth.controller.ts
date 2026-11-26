import { Body, Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import type { AuthTokens, MeResponse } from "@focus/contracts";
import type { AuthContext } from "./auth-context";
import { AuthService } from "./auth.service";
import { CurrentAuth } from "./current-auth.decorator";
import { Public } from "./public.decorator";

// Controller = transport uniquement (N-1) : validation et règles vivent dans
// le service. `@Public()` couvre les trois routes qui précèdent l'obtention
// d'un jeton ; tout le reste exige le guard global.
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @HttpCode(201)
  register(@Body() body: unknown): Promise<AuthTokens> {
    return this.auth.register(body);
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() body: unknown): Promise<AuthTokens> {
    return this.auth.login(body);
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() body: unknown): Promise<AuthTokens> {
    return this.auth.refresh(body);
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
}
