import { SetMetadata, type CustomDecorator } from "@nestjs/common";

// Routes hors authentification. Réservé aux sondes d'infrastructure : toute
// route métier est protégée par défaut (le guard global s'applique).
export const IS_PUBLIC_KEY = "auth:public";

export function Public(): CustomDecorator<string> {
  return SetMetadata(IS_PUBLIC_KEY, true);
}
