import { passwordSchema } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useConfirmPasswordReset } from "../api/use-auth";

export type ResetPasswordScreenProps = {
  readonly token: string | undefined;
};

export function ResetPasswordScreen({ token }: ResetPasswordScreenProps) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const confirm = useConfirmPasswordReset();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (token === undefined || token.length === 0) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
          <AppText tone="title">{t("auth.reset.invalidTitle")}</AppText>
          <AppText tone="muted">{t("auth.reset.invalidBody")}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("auth.reset.backToLogin")}
            onPress={() => {
              router.replace("/login");
            }}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <AppText>{t("auth.reset.backToLogin")}</AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  function submit(): void {
    if (!passwordSchema.safeParse(password).success) {
      setLocalError(t("auth.reset.invalidPassword"));
      return;
    }
    if (password !== confirmation) {
      setLocalError(t("auth.reset.mismatch"));
      return;
    }
    setLocalError(null);
    confirm.mutate(
      { token: token ?? "", password },
      {
        onSuccess: () => {
          router.replace("/login");
        },
      },
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <AppText tone="display">{t("auth.reset.title")}</AppText>
        <AppText tone="muted">{t("auth.reset.subtitle")}</AppText>

        <AppText tone="muted">{t("settings.fields.newPassword")}</AppText>
        <TextInput
          accessibilityLabel={t("settings.fields.newPassword")}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{
            minHeight: 44,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radii.md,
            borderWidth: theme.border.width,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.bg.surface,
            color: theme.colors.text.primary,
          }}
        />

        <AppText tone="muted">{t("auth.reset.confirmPassword")}</AppText>
        <TextInput
          accessibilityLabel={t("auth.reset.confirmPassword")}
          secureTextEntry
          value={confirmation}
          onChangeText={setConfirmation}
          style={{
            minHeight: 44,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radii.md,
            borderWidth: theme.border.width,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.bg.surface,
            color: theme.colors.text.primary,
          }}
        />

        {localError === null ? null : (
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {localError}
          </AppText>
        )}
        {confirm.isError ? (
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {t(appErrorMessageKey(confirm.error))}
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("auth.reset.submit")}
          accessibilityState={{ disabled: confirm.isPending }}
          disabled={confirm.isPending}
          onPress={submit}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.accent,
            opacity: confirm.isPending ? 0.6 : 1,
          }}
        >
          {confirm.isPending ? (
            <ActivityIndicator color={theme.colors.text.onAccent} />
          ) : (
            <AppText style={{ color: theme.colors.text.onAccent }}>
              {t("auth.reset.submit")}
            </AppText>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}
