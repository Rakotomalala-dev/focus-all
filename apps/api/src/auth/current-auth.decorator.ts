import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthContext, AuthenticatedRequest } from "./auth-context";

// Le contexte est posé par AuthGuard ; un handler protégé ne peut donc pas
// s'exécuter sans lui. Le controller ne lit jamais `userId`/`workspaceId`
// ailleurs (N-3).
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (auth === undefined) {
      // Inatteignable tant que le guard global est enregistré : on échoue
      // bruyamment plutôt que de laisser passer un contexte vide.
      throw new Error("AuthGuard n'a pas posé de contexte de session");
    }
    return auth;
  },
);
