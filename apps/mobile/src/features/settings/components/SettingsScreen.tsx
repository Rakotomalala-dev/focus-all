import type { ThemePreference, TimeFormat, WeekStart } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  View,
} from "react-native";
import { NotificationsSection } from "../../notifications";
import { OfflineDataSection } from "../../offline";
import { useDeleteAccount, useSession } from "../../auth/api/use-auth";
import { appErrorMessageKey } from "../../../data/http/app-error";
import {
  useChangePassword,
  useConnections,
  useExportAccount,
  useRevokeAllSessions,
  useRevokeSession,
  useSessions,
  useUpdateProfile,
} from "../api/use-settings";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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

type ChoiceProps<T extends string> = {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
};

function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>) {
  const theme = useFocusTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText tone="muted">{label}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => {
                onChange(option.value);
              }}
              style={{
                minHeight: 44,
                paddingHorizontal: theme.spacing.md,
                justifyContent: "center",
                borderRadius: theme.radii.md,
                borderWidth: theme.border.width,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected ? theme.colors.accent : theme.colors.bg.surface,
              }}
            >
              <AppText style={{ color: selected ? theme.colors.text.onAccent : undefined }}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsScreen() {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useSession();
  const update = useUpdateProfile();
  const changePassword = useChangePassword();
  const sessions = useSessions();
  const connections = useConnections();
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const exportAccount = useExportAccount();
  const deleteAccount = useDeleteAccount();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [exportHint, setExportHint] = useState<string | null>(null);

  if (user === null) {
    return (
      <Screen>
        <AppText tone="muted">{t("settings.signedOut")}</AppText>
      </Screen>
    );
  }

  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  }

  function saveProfile(): void {
    update.mutate({
      displayName: displayName.trim(),
      timezone,
      avatarUrl: avatarUrl.trim().length === 0 ? null : avatarUrl.trim(),
    });
  }

  function savePreference(
    input:
      | { theme: ThemePreference }
      | { locale: "fr" | "en" }
      | { weekStartsOn: WeekStart }
      | { timeFormat: TimeFormat }
      | { quickAddParsingEnabled: boolean },
  ): void {
    update.mutate(input);
  }

  async function exportData(): Promise<void> {
    setExportHint(null);
    try {
      const data = await exportAccount.mutateAsync();
      const message = JSON.stringify(data, null, 2);
      if (Platform.OS === "web") {
        const blob = new Blob([message], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `focus-export-${data.exportedAt.slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message });
      }
      setExportHint(t("settings.danger.exported"));
    } catch {
      setExportHint(t("settings.danger.exportError"));
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <View
            accessibilityLabel={t("settings.avatarLabel", { name: user.displayName })}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.accent,
            }}
          >
            <AppText style={{ color: theme.colors.text.onAccent, fontWeight: "600" }}>
              {initialsOf(user.displayName)}
            </AppText>
          </View>
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <AppText tone="display">{t("settings.title")}</AppText>
            <AppText tone="muted">{user.email}</AppText>
          </View>
        </View>

        <Section title={t("settings.profile.title")}>
          <AppText tone="muted">{t("settings.fields.displayName")}</AppText>
          <TextInput
            accessibilityLabel={t("settings.fields.displayName")}
            value={displayName}
            onChangeText={setDisplayName}
            style={fieldStyle(theme)}
          />
          <AppText tone="muted">{t("settings.fields.avatarUrl")}</AppText>
          <TextInput
            accessibilityLabel={t("settings.fields.avatarUrl")}
            autoCapitalize="none"
            autoCorrect={false}
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder={t("settings.fields.avatarPlaceholder")}
            placeholderTextColor={theme.colors.text.muted}
            style={fieldStyle(theme)}
          />
          <AppText tone="muted">{t("settings.fields.timezone")}</AppText>
          <TextInput
            accessibilityLabel={t("settings.fields.timezone")}
            autoCapitalize="none"
            autoCorrect={false}
            value={timezone}
            onChangeText={setTimezone}
            placeholder="Europe/Paris"
            placeholderTextColor={theme.colors.text.muted}
            style={fieldStyle(theme)}
          />
          <Action
            label={t("settings.profile.save")}
            pending={update.isPending}
            onPress={saveProfile}
          />
          {update.isError ? (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {t(appErrorMessageKey(update.error))}
            </AppText>
          ) : null}
          {update.isSuccess ? (
            <AppText tone="muted">{t("settings.profile.saved")}</AppText>
          ) : null}
        </Section>

        <Section title={t("settings.preferences.title")}>
          <Choice
            label={t("settings.fields.quickAddParsing")}
            value={user.quickAddParsingEnabled ? "ON" : "OFF"}
            options={[
              { value: "ON" as const, label: t("settings.toggle.on") },
              { value: "OFF" as const, label: t("settings.toggle.off") },
            ]}
            onChange={(value) => {
              savePreference({ quickAddParsingEnabled: value === "ON" });
            }}
          />
          <Choice
            label={t("settings.fields.language")}
            value={user.locale}
            options={[
              { value: "fr" as const, label: t("settings.languages.fr") },
              { value: "en" as const, label: t("settings.languages.en") },
            ]}
            onChange={(locale) => {
              savePreference({ locale });
            }}
          />
          <Choice
            label={t("settings.fields.weekStart")}
            value={user.weekStartsOn}
            options={[
              { value: "MONDAY" as const, label: t("settings.weekStarts.MONDAY") },
              { value: "SUNDAY" as const, label: t("settings.weekStarts.SUNDAY") },
            ]}
            onChange={(weekStartsOn) => {
              savePreference({ weekStartsOn });
            }}
          />
          <Choice
            label={t("settings.fields.timeFormat")}
            value={user.timeFormat}
            options={[
              { value: "H24" as const, label: t("settings.timeFormats.H24") },
              { value: "H12" as const, label: t("settings.timeFormats.H12") },
            ]}
            onChange={(timeFormat) => {
              savePreference({ timeFormat });
            }}
          />
          <Choice
            label={t("settings.fields.theme")}
            value={user.theme}
            options={[
              { value: "SYSTEM" as const, label: t("settings.themes.SYSTEM") },
              { value: "LIGHT" as const, label: t("settings.themes.LIGHT") },
              { value: "DARK" as const, label: t("settings.themes.DARK") },
            ]}
            onChange={(nextTheme) => {
              savePreference({ theme: nextTheme });
            }}
          />
        </Section>

        <Section title={t("settings.security.title")}>
          <AppText tone="muted">{t("settings.security.passwordHint")}</AppText>
          <TextInput
            accessibilityLabel={t("settings.fields.currentPassword")}
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            style={fieldStyle(theme)}
          />
          <TextInput
            accessibilityLabel={t("settings.fields.newPassword")}
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            style={fieldStyle(theme)}
          />
          <Action
            label={t("settings.security.changePassword")}
            pending={changePassword.isPending}
            onPress={() => {
              changePassword.mutate(
                { currentPassword, newPassword },
                {
                  onSuccess: () => {
                    setCurrentPassword("");
                    setNewPassword("");
                  },
                },
              );
            }}
          />
          {changePassword.isError ? (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {t(appErrorMessageKey(changePassword.error))}
            </AppText>
          ) : null}
          {changePassword.isSuccess ? (
            <AppText tone="muted">{t("settings.security.passwordChanged")}</AppText>
          ) : null}
        </Section>

        <Section title={t("settings.sessions.title")}>
          {sessions.status === "pending" ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : null}
          {sessions.status === "error" ? (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {t(appErrorMessageKey(sessions.error))}
            </AppText>
          ) : null}
          {sessions.status === "success" && sessions.data.items.length === 0 ? (
            <AppText tone="muted">{t("settings.sessions.empty")}</AppText>
          ) : null}
          {sessions.status === "success"
            ? sessions.data.items.map((session) => (
                <View
                  key={session.id}
                  style={{
                    gap: theme.spacing.xs,
                    paddingVertical: theme.spacing.sm,
                    borderBottomWidth: theme.border.width,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <AppText>
                    {session.deviceName ??
                      session.platform ??
                      t("settings.sessions.unknownDevice")}
                    {session.current ? ` · ${t("settings.sessions.current")}` : ""}
                  </AppText>
                  <AppText tone="muted">
                    {t("settings.sessions.lastUsed", { date: formatDate(session.lastUsedAt) })}
                  </AppText>
                  <Action
                    label={t("settings.sessions.revoke")}
                    pending={revokeSession.isPending}
                    onPress={() => {
                      revokeSession.mutate(session.id);
                    }}
                  />
                </View>
              ))
            : null}
          <Action
            label={t("settings.sessions.revokeAll")}
            pending={revokeAll.isPending}
            onPress={() => {
              revokeAll.mutate(undefined, {
                onSettled: () => {
                  router.replace("/login");
                },
              });
            }}
          />

          <AppText tone="title">{t("settings.connections.title")}</AppText>
          {connections.status === "success"
            ? connections.data.items.slice(0, 5).map((connection) => (
                <AppText key={connection.id} tone="muted">
                  {connection.platform ?? t("settings.sessions.unknownDevice")} ·{" "}
                  {formatDate(connection.lastUsedAt)} ·{" "}
                  {connection.active
                    ? t("settings.connections.active")
                    : t("settings.connections.revoked")}
                </AppText>
              ))
            : null}
        </Section>

        <NotificationsSection />

        <OfflineDataSection />

        <Section title={t("settings.danger.title")}>
          <Action
            label={t("settings.danger.export")}
            pending={exportAccount.isPending}
            onPress={() => {
              void exportData();
            }}
          />
          {exportHint === null ? null : <AppText tone="muted">{exportHint}</AppText>}

          <AppText tone="muted">{t("settings.danger.deleteHint")}</AppText>
          <TextInput
            accessibilityLabel={t("settings.fields.deletionPassword")}
            secureTextEntry
            value={deletionPassword}
            onChangeText={setDeletionPassword}
            style={fieldStyle(theme)}
          />
          <TextInput
            accessibilityLabel={t("settings.fields.deletionConfirmation")}
            autoCapitalize="characters"
            value={deletionConfirmation}
            onChangeText={setDeletionConfirmation}
            placeholder="DELETE"
            placeholderTextColor={theme.colors.text.muted}
            style={fieldStyle(theme)}
          />
          <Action
            label={t("settings.danger.delete")}
            danger
            pending={deleteAccount.isPending}
            disabled={deletionConfirmation !== "DELETE" || deletionPassword.length === 0}
            onPress={() => {
              // Double garde : l'état désactivé ne doit pas dépendre du seul
              // rendu de la plateforme (web, lecteur d'écran).
              if (deletionConfirmation !== "DELETE" || deletionPassword.length === 0) {
                return;
              }
              deleteAccount.mutate(deletionPassword, {
                onSuccess: () => {
                  router.replace("/login");
                },
              });
            }}
          />
          {deleteAccount.isError ? (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {t(appErrorMessageKey(deleteAccount.error))}
            </AppText>
          ) : null}
        </Section>
      </ScrollView>
    </Screen>
  );
}

type SectionProps = {
  readonly title: string;
  readonly children: ReactNode;
};

function Section({ title, children }: SectionProps) {
  const theme = useFocusTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText tone="title">{title}</AppText>
      <View style={{ gap: theme.spacing.sm }}>{children}</View>
    </View>
  );
}

type ActionProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly pending: boolean;
  readonly disabled?: boolean;
  readonly danger?: boolean;
};

function Action({ label, onPress, pending, disabled, danger }: ActionProps) {
  const theme = useFocusTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: pending || disabled === true }}
      disabled={pending || disabled === true}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: theme.spacing.md,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radii.md,
        borderWidth: theme.border.width,
        borderColor: danger === true ? theme.colors.state.danger : theme.colors.border,
        opacity: pending || disabled === true ? 0.6 : 1,
      }}
    >
      {pending ? (
        <ActivityIndicator color={danger === true ? theme.colors.state.danger : theme.colors.accent} />
      ) : (
        <AppText
          style={danger === true ? { color: theme.colors.state.danger } : undefined}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
