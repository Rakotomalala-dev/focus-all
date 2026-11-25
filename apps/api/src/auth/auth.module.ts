import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { resolveAuthConfig } from "./auth.config";

// JwtModule est exporté pour que le guard global (déclaré dans AppModule) et
// les tests d'intégration partagent exactement la même configuration de
// vérification : secret, issuer, audience et algorithme.
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const { secret, issuer, audience, accessTtl } = resolveAuthConfig(process.env);
        return {
          secret,
          signOptions: { issuer, audience, expiresIn: accessTtl },
          verifyOptions: { issuer, audience, algorithms: ["HS256"] },
        };
      },
    }),
  ],
  exports: [JwtModule],
})
export class AuthModule {}
