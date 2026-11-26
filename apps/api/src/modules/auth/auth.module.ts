import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AppConfigModule, APP_ENV } from "../../config/app-config.module";
import type { Env } from "../../config/env.schema";
import { AuthController, MeController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordHasher } from "./password-hasher";

// JwtModule est exporté pour que le guard global (déclaré dans AppModule) et
// les tests d'intégration partagent exactement la même configuration de
// vérification : secret, issuer, audience et algorithme.
@Module({
  imports: [
    // Nécessaire pour que `AuthService` et `PasswordHasher` injectent APP_ENV :
    // les imports internes de `JwtModule.registerAsync` ne sont pas exportés.
    AppConfigModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [APP_ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          expiresIn: env.JWT_ACCESS_TTL,
        },
        verifyOptions: {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          algorithms: ["HS256"],
        },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, PasswordHasher],
  exports: [JwtModule],
})
export class AuthModule {}
