import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../data/http/app-error";
import "../../../i18n";
import { AuthScreen } from "./AuthScreen";

const mocks = vi.hoisted(() => ({
  loginMutateAsync: vi.fn(),
  registerMutateAsync: vi.fn(),
  loginResult: {
    isPending: false,
    isError: false,
    error: null as unknown,
  },
  registerResult: {
    isPending: false,
    isError: false,
    error: null as unknown,
  },
}));

// Les mutations sont mockées : l'écran doit être vérifiable sans réseau, sans
// store de session ni SecureStore.
vi.mock("../api/use-auth", () => ({
  useLogin: () => ({ ...mocks.loginResult, mutateAsync: mocks.loginMutateAsync }),
  useRegister: () => ({ ...mocks.registerResult, mutateAsync: mocks.registerMutateAsync }),
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    mocks.loginMutateAsync.mockReset();
    mocks.registerMutateAsync.mockReset();
    mocks.loginResult.isError = false;
    mocks.loginResult.error = null;
    mocks.registerResult.isError = false;
    mocks.registerResult.error = null;
  });

  it("ouvre en mode connexion sans champ de nom", () => {
    render(<AuthScreen />);

    expect(screen.getByText("Connexion")).toBeTruthy();
    expect(screen.getByLabelText("E-mail")).toBeTruthy();
    expect(screen.getByLabelText("Mot de passe")).toBeTruthy();
    expect(screen.queryByLabelText("Nom affiché")).toBeNull();
  });

  it("refuse un formulaire vide sans appeler le serveur", async () => {
    render(<AuthScreen />);

    fireEvent.press(screen.getByLabelText("Se connecter"));

    await waitFor(() => {
      expect(
        screen.getByText("Vérifiez l'e-mail et le mot de passe (10 caractères minimum)."),
      ).toBeTruthy();
    });
    expect(mocks.loginMutateAsync).not.toHaveBeenCalled();
  });

  it("envoie les identifiants saisis", async () => {
    render(<AuthScreen />);

    fireEvent.changeText(screen.getByLabelText("E-mail"), "demo@focus.local");
    fireEvent.changeText(screen.getByLabelText("Mot de passe"), "focus-dev-password");
    fireEvent.press(screen.getByLabelText("Se connecter"));

    await waitFor(() => {
      expect(mocks.loginMutateAsync).toHaveBeenCalledWith({
        email: "demo@focus.local",
        password: "focus-dev-password",
      });
    });
  });

  it("traduit un refus d'identifiants", () => {
    mocks.loginResult.isError = true;
    mocks.loginResult.error = new AppError({ code: "UNAUTHENTICATED", status: 401 });

    render(<AuthScreen />);

    expect(screen.getByText("E-mail ou mot de passe incorrect.")).toBeTruthy();
  });

  it("bascule en inscription et transmet le nom affiché", async () => {
    render(<AuthScreen />);

    fireEvent.press(screen.getByLabelText("Créer un compte"));

    expect(screen.getByText("Créer un compte")).toBeTruthy();
    expect(screen.getByLabelText("Nom affiché")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Nom affiché"), "Ada");
    fireEvent.changeText(screen.getByLabelText("E-mail"), "ada@focus.local");
    fireEvent.changeText(screen.getByLabelText("Mot de passe"), "motdepasse-solide");
    fireEvent.press(screen.getByLabelText("Créer mon compte"));

    await waitFor(() => {
      expect(mocks.registerMutateAsync).toHaveBeenCalledWith({
        email: "ada@focus.local",
        password: "motdepasse-solide",
        displayName: "Ada",
      });
    });
  });
});
