import { AppText, useFocusTheme } from "@focus/ui";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";

// Règle des quatre états (doc 04 §5.2) : chargement, erreur, vide, contenu.
// Les quatre écrans de vue partagent ces trois blocs pour rester cohérents.
export function ViewLoading({ messageKey }: { readonly messageKey: string }) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
      <ActivityIndicator color={theme.colors.accent} />
      <AppText tone="muted">{t(messageKey)}</AppText>
    </View>
  );
}

export function ViewError({
  titleKey,
  error,
  onRetry,
}: {
  readonly titleKey: string;
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
      <AppText tone="title">{t(titleKey)}</AppText>
      <AppText tone="muted" style={{ textAlign: "center" }}>
        {t(appErrorMessageKey(error))}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("views.error.retry")}
        onPress={onRetry}
        style={{
          minHeight: 44,
          paddingHorizontal: theme.spacing.lg,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radii.md,
          borderWidth: theme.border.width,
          borderColor: theme.colors.border,
        }}
      >
        <AppText>{t("views.error.retry")}</AppText>
      </Pressable>
    </View>
  );
}

export function ViewEmpty({
  titleKey,
  bodyKey,
}: {
  readonly titleKey: string;
  readonly bodyKey: string;
}) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.xs }}>
      <AppText tone="title">{t(titleKey)}</AppText>
      <AppText tone="muted" style={{ textAlign: "center" }}>
        {t(bodyKey)}
      </AppText>
    </View>
  );
}
