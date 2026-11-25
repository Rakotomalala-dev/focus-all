import "../src/i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { queryClient } from "../src/data/query-client";

export default function RootLayout() {
  const { t } = useTranslation();

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: t("app.name") }} />
      </Stack>
    </QueryClientProvider>
  );
}
