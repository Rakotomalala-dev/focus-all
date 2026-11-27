import "../src/i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { FocusThemeProvider } from "@focus/ui";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { hydrateSession } from "../src/data/auth/auth-service";
import { useSessionStore } from "../src/data/auth/session-store";
import { queryClient } from "../src/data/query-client";

export default function RootLayout() {
  const { t } = useTranslation();
  const theme = useSessionStore((state) => state.user?.theme ?? "SYSTEM");
  const hydrationStarted = useRef(false);

  useEffect(() => {
    if (hydrationStarted.current) {
      return;
    }
    hydrationStarted.current = true;
    void hydrateSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <FocusThemeProvider mode={theme}>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="index" options={{ title: t("app.name") }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: t("settings.title") }} />
          <Stack.Screen name="tasks/[id]" options={{ title: t("tasks.detail.title") }} />
          <Stack.Screen name="projects/index" options={{ title: t("projects.title") }} />
          <Stack.Screen name="projects/[id]" options={{ title: t("projects.detail.title") }} />
        </Stack>
      </FocusThemeProvider>
    </QueryClientProvider>
  );
}
