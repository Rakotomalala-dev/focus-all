import { emailSchema, loginInputSchema, registerInputSchema } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import {
  AppError,
  appErrorMessageKey,
  type AppErrorMessageKey,
} from "../../../data/http/app-error";
import { detectTimezone } from "../../../data/device/timezone";
import { useLogin, useRegister, useRequestPasswordReset } from "../api/use-auth";

type AuthMode = "login" | "register" | "forgot";

type AuthForm = {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
};

type MessageKey =
  | AppErrorMessageKey
  | "auth.errors.invalidCredentials"
  | "auth.errors.emailTaken"
  | "auth.errors.validation"
  | "auth.forgot.invalidEmail";

// Un formulaire unique pour les deux modes : les champs communs restent au même
// endroit, et le contrat partagé porte les bornes (RF-01).
export function AuthScreen() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [validationKey, setValidationKey] = useState<MessageKey | null>(null);
  const login = useLogin();
  const register = useRegister();
  const reset = useRequestPasswordReset();
  const mutation = mode === "login" ? login : mode === "register" ? register : reset;

  const { control, handleSubmit, reset: resetForm } = useForm<AuthForm>({
    defaultValues: { email: "", password: "", displayName: "" },
  });

  const submit = handleSubmit(async (values) => {
    if (mode === "forgot") {
      const parsed = emailSchema.safeParse(values.email);
      if (!parsed.success) {
        setValidationKey("auth.forgot.invalidEmail");
        return;
      }
      setValidationKey(null);
      try {
        await reset.mutateAsync(parsed.data);
      } catch {
        // L'erreur est rendue via `mutation.error`.
      }
      return;
    }

    if (mode === "login") {
      const parsed = loginInputSchema.safeParse({
        email: values.email,
        password: values.password,
      });
      if (!parsed.success) {
        setValidationKey("auth.errors.validation");
        return;
      }

      setValidationKey(null);
      try {
        await login.mutateAsync(parsed.data);
      } catch {
        // L'erreur est rendue sous le formulaire via `mutation.error`.
      }
      return;
    }

    const displayName = values.displayName.trim();
    const timezone = detectTimezone();
    const parsed = registerInputSchema.safeParse({
      email: values.email,
      password: values.password,
      ...(displayName.length === 0 ? {} : { displayName }),
      ...(timezone === undefined ? {} : { timezone }),
    });
    if (!parsed.success) {
      setValidationKey("auth.errors.validation");
      return;
    }

    setValidationKey(null);
    try {
      await register.mutateAsync(parsed.data);
    } catch {
      // Idem : le formulaire reste rempli pour une nouvelle tentative.
    }
  });

  function switchMode(next: AuthMode): void {
    setMode(next);
    setValidationKey(null);
    resetForm();
  }

  function messageFor(error: unknown): MessageKey {
    if (error instanceof AppError) {
      if (mode === "login" && error.status === 401) {
        return "auth.errors.invalidCredentials";
      }
      if (mode === "register" && error.status === 409) {
        return "auth.errors.emailTaken";
      }
    }
    return appErrorMessageKey(error);
  }

  function renderField(
    controlRef: Control<AuthForm>,
    name: keyof AuthForm,
    options: {
      readonly secure?: boolean;
      readonly email?: boolean;
      readonly autoComplete: "email" | "current-password" | "new-password" | "name";
    },
  ) {
    return (
      <Controller
        control={controlRef}
        name={name}
        render={({ field: { onBlur, onChange, value } }) => (
          <View style={{ gap: theme.spacing.xs }}>
            <AppText tone="muted">{t(`auth.fields.${name}`)}</AppText>
            <TextInput
              accessibilityLabel={t(`auth.fields.${name}`)}
              autoCapitalize="none"
              autoComplete={options.autoComplete}
              autoCorrect={false}
              keyboardType={options.email === true ? "email-address" : "default"}
              secureTextEntry={options.secure === true}
              placeholderTextColor={theme.colors.text.muted}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              editable={!mutation.isPending}
              style={{
                minHeight: 44,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radii.md,
                borderWidth: theme.border.width,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.bg.surface,
                color: theme.colors.text.primary,
                fontFamily: theme.fontFamilies.text,
                fontSize: theme.typography.md.size,
              }}
            />
          </View>
        )}
      />
    );
  }

  const errorMessage =
    validationKey ??
    (mutation.isError ? messageFor(mutation.error) : null);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="display">
            {t(
              mode === "login"
                ? "auth.login.title"
                : mode === "register"
                  ? "auth.register.title"
                  : "auth.forgot.title",
            )}
          </AppText>
          <AppText tone="muted">
            {t(
              mode === "login"
                ? "auth.login.subtitle"
                : mode === "register"
                  ? "auth.register.subtitle"
                  : "auth.forgot.subtitle",
            )}
          </AppText>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          {mode === "register"
            ? renderField(control, "displayName", { autoComplete: "name" })
            : null}
          {renderField(control, "email", { email: true, autoComplete: "email" })}
          {mode === "forgot"
            ? null
            : renderField(control, "password", {
                secure: true,
                autoComplete: mode === "login" ? "current-password" : "new-password",
              })}
          {mode === "register" ? (
            <AppText tone="muted">{t("auth.passwordHint")}</AppText>
          ) : null}
        </View>

        {mode === "forgot" && reset.isSuccess ? (
          <AppText accessibilityLiveRegion="polite" tone="muted">
            {t("auth.forgot.sent")}
          </AppText>
        ) : null}

        {errorMessage === null ? null : (
          <AppText
            accessibilityLiveRegion="polite"
            tone="muted"
            style={{ color: theme.colors.state.danger }}
          >
            {t(errorMessage)}
          </AppText>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            mode === "login"
              ? "auth.login.submit"
              : mode === "register"
                ? "auth.register.submit"
                : "auth.forgot.submit",
          )}
          accessibilityState={{ disabled: mutation.isPending }}
          disabled={mutation.isPending}
          onPress={() => {
            void submit();
          }}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.accent,
            opacity: mutation.isPending ? 0.6 : 1,
          }}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={theme.colors.text.onAccent} />
          ) : (
            <AppText style={{ color: theme.colors.text.onAccent, fontWeight: "600" }}>
              {t(
                mode === "login"
                  ? "auth.login.submit"
                  : mode === "register"
                    ? "auth.register.submit"
                    : "auth.forgot.submit",
              )}
            </AppText>
          )}
        </Pressable>

        {mode === "login" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("auth.forgot.link")}
            onPress={() => {
              switchMode("forgot");
            }}
            style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
          >
            <AppText tone="muted">{t("auth.forgot.link")}</AppText>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            mode === "login" ? "auth.login.switch" : mode === "register" ? "auth.register.switch" : "auth.forgot.back",
          )}
          onPress={() => {
            switchMode(mode === "login" ? "register" : "login");
          }}
          style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <AppText tone="muted">
            {t(
              mode === "login"
                ? "auth.login.switch"
                : mode === "register"
                  ? "auth.register.switch"
                  : "auth.forgot.back",
            )}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}
