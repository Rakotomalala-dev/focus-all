import "../src/i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { FocusThemeProvider } from "@focus/ui";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { hydrateSession } from "../src/data/auth/auth-service";
import { useSessionStore } from "../src/data/auth/session-store";
import { startConnectionWatcher } from "../src/data/offline/connection-store";
import { queryClient } from "../src/data/query-client";
import { trackTelemetry } from "../src/data/telemetry/telemetry";
import { ConnectionBanner, useOfflineSync } from "../src/features/offline";

// Le bootstrap hors ligne vit sous le QueryClientProvider : il publie l'état
// de synchronisation lu par le bandeau global.
function OfflineBridge() {
  useOfflineSync();
  return null;
}

export default function RootLayout() {
  const { t } = useTranslation();
  const theme = useSessionStore((state) => state.user?.theme ?? "SYSTEM");
  const telemetryEnabled = useSessionStore(
    (state) => state.user?.telemetryEnabled ?? false,
  );
  const hydrationStarted = useRef(false);

  useEffect(() => {
    if (hydrationStarted.current) {
      return;
    }
    hydrationStarted.current = true;
    void hydrateSession();
  }, []);

  useEffect(() => startConnectionWatcher(), []);

  useEffect(() => {
    if (telemetryEnabled) {
      void trackTelemetry("app_open");
    }
  }, [telemetryEnabled]);

  return (
    <QueryClientProvider client={queryClient}>
      <FocusThemeProvider mode={theme}>
        <StatusBar style="auto" />
        <View style={{ flex: 1 }}>
          <ConnectionBanner />
          <OfflineBridge />
          <Stack>
            <Stack.Screen name="index" options={{ title: t("app.name") }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="reset-password" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ title: t("settings.title") }} />
            <Stack.Screen name="trash" options={{ title: t("trash.title") }} />
            <Stack.Screen name="tags" options={{ title: t("tags.title") }} />
            <Stack.Screen name="tasks/[id]" options={{ title: t("tasks.detail.title") }} />
            <Stack.Screen name="views/today" options={{ title: t("views.today.title") }} />
            <Stack.Screen name="views/upcoming" options={{ title: t("views.upcoming.title") }} />
            <Stack.Screen name="views/calendar" options={{ title: t("views.calendar.title") }} />
            <Stack.Screen name="views/kanban" options={{ title: t("views.kanban.title") }} />
            <Stack.Screen name="projects/index" options={{ title: t("projects.title") }} />
            <Stack.Screen name="projects/[id]" options={{ title: t("projects.detail.title") }} />
          </Stack>
        </View>
      </FocusThemeProvider>
    </QueryClientProvider>
  );
}
