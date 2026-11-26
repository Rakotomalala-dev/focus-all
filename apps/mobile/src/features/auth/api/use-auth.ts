import { useMutation } from "@tanstack/react-query";
import { signIn, signOut, signUp } from "../../../data/auth/auth-service";
import { useSessionStore } from "../../../data/auth/session-store";

export function useSession() {
  return useSessionStore();
}

export function useLogin() {
  return useMutation({ mutationFn: signIn });
}

export function useRegister() {
  return useMutation({ mutationFn: signUp });
}

export function useLogout() {
  return useMutation({ mutationFn: signOut });
}
