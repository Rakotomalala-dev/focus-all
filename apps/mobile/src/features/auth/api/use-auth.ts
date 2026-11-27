import { useMutation } from "@tanstack/react-query";
import {
  confirmPasswordReset,
  deleteAccount,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
} from "../../../data/auth/auth-service";
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

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      confirmPasswordReset(input.token, input.password),
  });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: deleteAccount });
}
