import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useTranslation } from "react-i18next";
import { useSession } from "../src/features/auth";
import { TasksScreen } from "../src/features/tasks";

// Porte d'entrée : la session décide de l'écran, la route ne connaît ni jeton
// ni formulaire.
export default function TasksRoute() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const { status } = useSession();

  if (status === "loading") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("auth.restoring")}</AppText>
        </View>
      </Screen>
    );
  }

  if (status === "signedOut") {
    return <Redirect href="/login" />;
  }

  return <TasksScreen />;
}
