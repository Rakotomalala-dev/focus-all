import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useRestoreProject } from "../../projects/api/use-projects";
import { useRestoreTask, useTrash } from "../../tasks/api/use-tasks";

// RF-29 : toute suppression est réversible pendant 30 jours.
export function TrashScreen() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const trash = useTrash();
  const restoreTask = useRestoreTask();
  const restoreProject = useRestoreProject();

  if (trash.status === "pending") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (trash.status === "error") {
    return (
      <Screen>
        <AppText tone="title">{t("trash.error")}</AppText>
        <AppText tone="muted">{t(appErrorMessageKey(trash.error))}</AppText>
      </Screen>
    );
  }

  const isEmpty = trash.data.tasks.length === 0 && trash.data.projects.length === 0;

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <AppText tone="display">{t("trash.title")}</AppText>
        <AppText tone="muted">{t("trash.hint")}</AppText>

        {isEmpty ? <AppText tone="muted">{t("trash.empty")}</AppText> : null}

        {trash.data.projects.length > 0 ? (
          <AppText tone="title">{t("trash.projects")}</AppText>
        ) : null}
        {trash.data.projects.map((project) => (
          <Row
            key={project.id}
            label={project.name}
            action={t("trash.restore")}
            onPress={() => restoreProject.mutate(project.id)}
          />
        ))}

        {trash.data.tasks.length > 0 ? (
          <AppText tone="title">{t("trash.tasks")}</AppText>
        ) : null}
        {trash.data.tasks.map((task) => (
          <Row
            key={task.id}
            label={task.title}
            action={t("trash.restore")}
            onPress={() => restoreTask.mutate(task.id)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

function Row({
  label,
  action,
  onPress,
}: {
  readonly label: string;
  readonly action: string;
  readonly onPress: () => void;
}) {
  const theme = useFocusTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: theme.spacing.sm,
        borderBottomWidth: theme.border.width,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action} ${label}`}
        onPress={onPress}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <AppText>{action}</AppText>
      </Pressable>
    </View>
  );
}
