import type { Task } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useCreateTask, useSetTaskStatus, useTasks } from "../api/use-tasks";
import { parseQuickTask } from "../utils/parse-quick-task";
import { TaskCard } from "./TaskCard";
import { TaskComposer } from "./TaskComposer";

export function TasksScreen() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const tasksQuery = useTasks();
  const createTask = useCreateTask();
  const setStatus = useSetTaskStatus();

  async function handleCreate(input: string): Promise<void> {
    await createTask.mutateAsync(parseQuickTask(input, { now: new Date() }));
  }

  function handleToggle(task: Task): void {
    setStatus.mutate({ task, status: task.status === "DONE" ? "TODO" : "DONE" });
  }

  function renderBody() {
    if (tasksQuery.status === "pending") {
      return (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}
        >
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("tasks.loading")}</AppText>
        </View>
      );
    }

    if (tasksQuery.status === "error") {
      return (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}
        >
          <AppText tone="title">{t("tasks.error.title")}</AppText>
          <AppText tone="muted" style={{ textAlign: "center" }}>
            {t(appErrorMessageKey(tasksQuery.error))}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tasks.error.retry")}
            onPress={() => {
              void tasksQuery.refetch();
            }}
            style={{
              minHeight: 44,
              minWidth: 44,
              paddingHorizontal: theme.spacing.lg,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.radii.md,
              borderWidth: theme.border.width,
              borderColor: theme.colors.border,
            }}
          >
            <AppText>{t("tasks.error.retry")}</AppText>
          </Pressable>
        </View>
      );
    }

    const { items } = tasksQuery.data;
    if (items.length === 0) {
      return (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.xs }}
        >
          <AppText tone="title">{t("tasks.empty.title")}</AppText>
          <AppText tone="muted" style={{ textAlign: "center" }}>
            {t("tasks.empty.body")}
          </AppText>
        </View>
      );
    }

    return (
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard task={item} onToggle={handleToggle} isPending={setStatus.isPending} />
        )}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
      />
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="display">{t("tasks.title")}</AppText>
          {tasksQuery.status === "success" ? (
            <AppText tone="muted">
              {t("tasks.count", { count: tasksQuery.data.items.length })}
            </AppText>
          ) : null}
        </View>

        <TaskComposer onCreate={handleCreate} isSubmitting={createTask.isPending} />

        {createTask.isError ? (
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {t(appErrorMessageKey(createTask.error))}
          </AppText>
        ) : null}

        {renderBody()}
      </View>
    </Screen>
  );
}
