import { hhmmSchema } from "@focus/contracts";
import { AppText, useFocusTheme } from "@focus/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, Pressable, Switch, TextInput, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useNotificationStore } from "../../../data/notifications/notification-store";
import {
  useNotificationPreferences,
  useRegisterPushDevice,
  useSetDeviceNotifications,
  useStoredDevice,
  useUpdateNotificationPreferences,
} from "../api/use-notifications";

// RF-50/RF-51 : catégories, plage silencieuse et activation par appareil.
// États : chargement, erreur, vide (aucun appareil enregistré), contenu.
export function NotificationsSection() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const preferences = useNotificationPreferences();
  const storedDevice = useStoredDevice();
  const register = useRegisterPushDevice();
  const setDeviceNotifications = useSetDeviceNotifications();
  const update = useUpdateNotificationPreferences();
  const schedulingFailed = useNotificationStore((state) => state.schedulingFailed);

  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [quietError, setQuietError] = useState<string | null>(null);

  useEffect(() => {
    if (preferences.data === undefined) return;
    const quiet = preferences.data.quietHours;
    setQuietEnabled(quiet !== null);
    setQuietStart(quiet?.start ?? "22:00");
    setQuietEnd(quiet?.end ?? "08:00");
  }, [preferences.data]);

  function saveQuietHours(): void {
    if (quietEnabled) {
      const valid =
        hhmmSchema.safeParse(quietStart).success &&
        hhmmSchema.safeParse(quietEnd).success &&
        quietStart !== quietEnd;
      if (!valid) {
        setQuietError(t("notifications.quiet.invalid"));
        return;
      }
    }
    setQuietError(null);
    update.mutate({ quietHours: quietEnabled ? { start: quietStart, end: quietEnd } : null });
  }

  function errorText(): string | null {
    if (register.isError) return t("notifications.device.error");
    if (update.isError) return t(appErrorMessageKey(update.error));
    return null;
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText tone="title">{t("notifications.title")}</AppText>
      <AppText tone="muted">{t("notifications.hint")}</AppText>

      {Platform.OS === "web" ? (
        <AppText tone="muted">{t("notifications.device.web")}</AppText>
      ) : null}

      {preferences.status === "pending" || storedDevice.status === "pending" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("notifications.loading")}</AppText>
        </View>
      ) : null}

      {preferences.status === "error" ? (
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {t("notifications.error")}
          </AppText>
          <SectionAction
            label={t("notifications.retry")}
            onPress={() => {
              void preferences.refetch();
            }}
          />
        </View>
      ) : null}

      {preferences.status === "success" && storedDevice.data === null ? (
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted">{t("notifications.device.empty")}</AppText>
          {Platform.OS === "web" ? null : (
            <SectionAction
              label={t("notifications.device.activate")}
              onPress={() => register.mutate()}
              pending={register.isPending}
            />
          )}
        </View>
      ) : null}

      {preferences.status === "success" &&
      storedDevice.status === "success" &&
      storedDevice.data !== null ? (
        <View style={{ gap: theme.spacing.md }}>
          <AppText tone="muted">{t("notifications.categories.title")}</AppText>
          <ToggleRow
            label={t("notifications.categories.reminders")}
            value={preferences.data.remindersEnabled}
            onValueChange={(value) => update.mutate({ remindersEnabled: value })}
            disabled={update.isPending}
          />
          <ToggleRow
            label={t("notifications.categories.dailySummary")}
            value={preferences.data.dailySummaryEnabled}
            onValueChange={(value) => update.mutate({ dailySummaryEnabled: value })}
            disabled={update.isPending}
          />
          <ToggleRow
            label={t("notifications.categories.collaboration")}
            value={preferences.data.collaborationEnabled}
            onValueChange={(value) => update.mutate({ collaborationEnabled: value })}
            disabled={update.isPending}
          />

          <AppText tone="muted">{t("notifications.quiet.title")}</AppText>
          <ToggleRow
            label={t("notifications.quiet.enable")}
            value={quietEnabled}
            onValueChange={setQuietEnabled}
            disabled={update.isPending}
          />
          {quietEnabled ? (
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <AppText tone="muted">{t("notifications.quiet.start")}</AppText>
                <TextInput
                  accessibilityLabel={t("notifications.quiet.start")}
                  value={quietStart}
                  onChangeText={setQuietStart}
                  placeholder="22:00"
                  placeholderTextColor={theme.colors.text.muted}
                  style={fieldStyle(theme)}
                />
              </View>
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <AppText tone="muted">{t("notifications.quiet.end")}</AppText>
                <TextInput
                  accessibilityLabel={t("notifications.quiet.end")}
                  value={quietEnd}
                  onChangeText={setQuietEnd}
                  placeholder="08:00"
                  placeholderTextColor={theme.colors.text.muted}
                  style={fieldStyle(theme)}
                />
              </View>
            </View>
          ) : null}
          {quietError === null ? null : (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {quietError}
            </AppText>
          )}
          <SectionAction
            label={t("notifications.quiet.save")}
            onPress={saveQuietHours}
            pending={update.isPending}
          />

          <AppText tone="muted">{t("notifications.device.title")}</AppText>
          <ToggleRow
            label={t("notifications.device.enable")}
            value={storedDevice.data.notificationsEnabled}
            onValueChange={(value) => setDeviceNotifications.mutate(value)}
            disabled={setDeviceNotifications.isPending}
          />
          {update.isSuccess ? (
            <AppText tone="muted">{t("notifications.saved")}</AppText>
          ) : null}
        </View>
      ) : null}

      {schedulingFailed ? (
        <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
          {t("notifications.schedulingFailed")}
        </AppText>
      ) : null}
      {errorText() === null ? null : (
        <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
          {errorText()}
        </AppText>
      )}
    </View>
  );
}

function fieldStyle(theme: ReturnType<typeof useFocusTheme>) {
  return {
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.border.width,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg.surface,
    color: theme.colors.text.primary,
    fontFamily: theme.fontFamilies.text,
    fontSize: theme.typography.md.size,
  } as const;
}

type ToggleRowProps = {
  readonly label: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly disabled: boolean;
};

function ToggleRow({ label, value, onValueChange, disabled }: ToggleRowProps) {
  const theme = useFocusTheme();
  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.spacing.sm,
      }}
    >
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Switch
        accessibilityLabel={label}
        accessibilityRole="switch"
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </View>
  );
}

type SectionActionProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly pending?: boolean;
};

function SectionAction({ label, onPress, pending }: SectionActionProps) {
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
        borderColor: theme.colors.border,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {disabled ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : (
        <AppText>{label}</AppText>
      )}
    </Pressable>
  );
}
