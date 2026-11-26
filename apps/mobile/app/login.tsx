import { Redirect } from "expo-router";
import { AuthScreen, useSession } from "../src/features/auth";

// Route = transport uniquement : l'écran gère le formulaire, la redirection
// dépend de la session restaurée.
export default function LoginRoute() {
  const { status } = useSession();

  if (status === "signedIn") {
    return <Redirect href="/" />;
  }

  return <AuthScreen />;
}
