import { Redirect, useRouter } from "expo-router";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSession } from "../src/features/auth";
import { SettingsScreen } from "../src/features/settings";

export default function SettingsRoute() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { status } = useSession();

  if (status === "loading") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (status === "signedOut") {
    return <Redirect href="/login" />;
  }

  return (
    <View style={{ flex: 1, gap: theme.spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("settings.back")}
        onPress={() => {
          router.back();
        }}
        style={{
          minHeight: 44,
          justifyContent: "center",
          paddingHorizontal: theme.spacing.xl,
        }}
      >
        <AppText tone="muted">{t("settings.back")}</AppText>
      </Pressable>
      <SettingsScreen />
    </View>
  );
}
