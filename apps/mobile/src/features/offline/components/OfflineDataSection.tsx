import { AppText, useFocusTheme } from "@focus/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useOfflineCache, useResetOfflineData } from "../api/use-offline";

// Réglages de la copie locale (RF-61/RF-64) avec les quatre états : chargement,
// erreur, vide, contenu. La réinitialisation demande une seconde confirmation
// et signale explicitement son succès ou son échec.
export function OfflineDataSection() {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const cache = useOfflineCache();
  const reset = useResetOfflineData();
  const [confirming, setConfirming] = useState(false);

  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  }

  function handleReset(): void {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    reset.mutate(undefined, {
      onSettled: () => {
        setConfirming(false);
      },
    });
  }

  const data = cache.data;
  const isEmpty = data !== undefined && data.lastSyncAt === null && data.taskCount === 0;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText tone="title">{t("offline.title")}</AppText>
      <AppText tone="muted">{t("offline.hint")}</AppText>

      {cache.status === "pending" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("offline.status.loading")}</AppText>
        </View>
      ) : null}

      {cache.status === "error" ? (
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {t("offline.status.error")}
          </AppText>
          <SectionAction
            label={t("offline.status.retry")}
            onPress={() => {
              void cache.refetch();
            }}
          />
        </View>
      ) : null}

      {cache.status === "success" && isEmpty ? (
        <AppText tone="muted">{t("offline.status.empty")}</AppText>
      ) : null}

      {cache.status === "success" && data !== undefined && !isEmpty ? (
        <View style={{ gap: theme.spacing.xs }}>
          <AppText>
            {t("offline.status.counts", {
              tasks: data.taskCount,
              projects: data.projectCount,
              tags: data.tagCount,
            })}
          </AppText>
          <AppText tone="muted">
            {t("offline.status.lastSync", {
              date:
                data.lastSyncAt === null
                  ? t("offline.neverSynced")
                  : formatDate(data.lastSyncAt),
            })}
          </AppText>
          {data.corruptedCount === 0 ? null : (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {t("offline.status.corrupted", { count: data.corruptedCount })}
            </AppText>
          )}
        </View>
      ) : null}

      <AppText tone="muted">{t("offline.reset.hint")}</AppText>
      <SectionAction
        label={confirming ? t("offline.reset.confirm") : t("offline.reset.action")}
        onPress={handleReset}
        pending={reset.isPending}
        danger
      />
      {confirming ? (
        <SectionAction
          label={t("offline.reset.cancel")}
          onPress={() => {
            setConfirming(false);
          }}
        />
      ) : null}

      {reset.isError ? (
        <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
          {t("offline.reset.error")}
        </AppText>
      ) : null}
      {reset.isSuccess ? (
        <AppText tone="muted">{t("offline.reset.done")}</AppText>
      ) : null}
    </View>
  );
}

type SectionActionProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly pending?: boolean;
  readonly danger?: boolean;
};

function SectionAction({ label, onPress, pending, danger }: SectionActionProps) {
  const theme = useFocusTheme();
  const disabled = pending === true;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: theme.spacing.md,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radii.md,
        borderWidth: theme.border.width,
        borderColor: danger === true ? theme.colors.state.danger : theme.colors.border,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {disabled ? (
        <ActivityIndicator
          color={danger === true ? theme.colors.state.danger : theme.colors.accent}
        />
      ) : (
        <AppText style={danger === true ? { color: theme.colors.state.danger } : undefined}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
