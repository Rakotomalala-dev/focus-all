import { AppText, useFocusTheme } from "@focus/ui";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConnectionStore } from "../../../data/offline/connection-store";

// RF-61 : un bandeau permanent indique l'état de connexion et la date de la
// dernière synchronisation. Il vit hors des écrans pour rester visible partout,
// y compris quand la liste affiche sa copie locale.
export function ConnectionBanner() {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const isOnline = useConnectionStore((state) => state.isOnline);
  const lastSyncAt = useConnectionStore((state) => state.lastSyncAt);
  const syncStatus = useConnectionStore((state) => state.syncStatus);

  const lastSync =
    lastSyncAt === null
      ? t("offline.neverSynced")
      : new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(lastSyncAt));

  const message =
    syncStatus === "syncing"
      ? t("offline.banner.syncing")
      : !isOnline
        ? t("offline.banner.offline", { date: lastSync })
        : syncStatus === "error"
          ? t("offline.banner.syncError", { date: lastSync })
          : t("offline.banner.online", { date: lastSync });

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ backgroundColor: isOnline ? theme.colors.bg.surface : theme.colors.state.warning }}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
        style={{
          minHeight: 32,
          justifyContent: "center",
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <AppText
          tone="muted"
          style={{ color: isOnline ? theme.colors.text.muted : theme.colors.bg.surface }}
        >
          {message}
        </AppText>
      </View>
    </SafeAreaView>
  );
}
