import { loginInputSchema, registerInputSchema } from "@focus/contracts";
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
import { useLogin, useRegister } from "../api/use-auth";

type AuthMode = "login" | "register";

type AuthForm = {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
};

type MessageKey =
  | AppErrorMessageKey
  | "auth.errors.invalidCredentials"
  | "auth.errors.emailTaken"
  | "auth.errors.validation";

// Un formulaire unique pour les deux modes : les champs communs restent au même
// endroit, et le contrat partagé porte les bornes (RF-01).
export function AuthScreen() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [validationKey, setValidationKey] = useState<MessageKey | null>(null);
  const login = useLogin();
  const register = useRegister();
  const mutation = mode === "login" ? login : register;

  const { control, handleSubmit, reset } = useForm<AuthForm>({
    defaultValues: { email: "", password: "", displayName: "" },
  });

  const submit = handleSubmit(async (values) => {
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
    const parsed = registerInputSchema.safeParse({
      email: values.email,
      password: values.password,
      ...(displayName.length === 0 ? {} : { displayName }),
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

  function switchMode(): void {
    setMode(mode === "login" ? "register" : "login");
    setValidationKey(null);
    reset();
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
            {t(mode === "login" ? "auth.login.title" : "auth.register.title")}
          </AppText>
          <AppText tone="muted">
            {t(mode === "login" ? "auth.login.subtitle" : "auth.register.subtitle")}
          </AppText>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          {mode === "register"
            ? renderField(control, "displayName", { autoComplete: "name" })
            : null}
          {renderField(control, "email", { email: true, autoComplete: "email" })}
          {renderField(control, "password", {
            secure: true,
            autoComplete: mode === "login" ? "current-password" : "new-password",
          })}
          {mode === "register" ? (
            <AppText tone="muted">{t("auth.passwordHint")}</AppText>
          ) : null}
        </View>

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
            mode === "login" ? "auth.login.submit" : "auth.register.submit",
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
              {t(mode === "login" ? "auth.login.submit" : "auth.register.submit")}
            </AppText>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            mode === "login" ? "auth.login.switch" : "auth.register.switch",
          )}
          onPress={switchMode}
          style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <AppText tone="muted">
            {t(mode === "login" ? "auth.login.switch" : "auth.register.switch")}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}
