import type { Task } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { TaskCard } from "../../tasks/components/TaskCard";
import { useSetViewTaskStatus, useUpcoming } from "../api/use-views";
import { formatDuration } from "../utils/format-duration";
import { formatDay } from "../utils/format-day";
import { ViewEmpty, ViewError, ViewLoading } from "./ViewStates";

// RF-32 : sept jours glissants, charge par jour et signal de surcharge.
export function UpcomingScreen() {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const upcomingQuery = useUpcoming();
  const setStatus = useSetViewTaskStatus();

  function openTask(task: Task): void {
    router.push({ pathname: "/tasks/[id]", params: { id: task.id } });
  }

  function renderBody() {
    if (upcomingQuery.status === "pending") {
      return <ViewLoading messageKey="views.upcoming.loading" />;
    }
    if (upcomingQuery.status === "error") {
      return (
        <ViewError
          titleKey="views.upcoming.error.title"
          error={upcomingQuery.error}
          onRetry={() => {
            void upcomingQuery.refetch();
          }}
        />
      );
    }
    if (upcomingQuery.data.days.every((day) => day.count === 0)) {
      return (
        <ViewEmpty
          titleKey="views.upcoming.empty.title"
          bodyKey="views.upcoming.empty.body"
        />
      );
    }

    return (
      <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        {upcomingQuery.data.days.map((day) => (
          <View key={day.date} style={{ gap: theme.spacing.xs }}>
            <View
              style={{
                minHeight: 44,
                justifyContent: "center",
                borderBottomWidth: theme.border.width,
                borderBottomColor: theme.colors.border,
              }}
            >
              <AppText tone="title">{formatDay(day.date, i18n.language)}</AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                <AppText tone="muted">
                  {t("views.upcoming.dayMeta", {
                    count: day.count,
                    duration: formatDuration(day.estimateMinutes),
                  })}
                </AppText>
                {day.overloaded ? (
                  <AppText style={{ color: theme.colors.state.warning }}>
                    {t("views.upcoming.overload")}
                  </AppText>
                ) : null}
              </View>
            </View>

            {day.tasks.length === 0 ? (
              <AppText tone="muted">{t("views.upcoming.noTasks")}</AppText>
            ) : (
              day.tasks.map((card) => (
                <View key={`${card.task.id}:${card.occurrenceDate ?? "none"}`}>
                  <TaskCard
                    task={card.task}
                    onToggle={(task) => {
                      setStatus.mutate({
                        task,
                        status: task.status === "DONE" ? "TODO" : "DONE",
                      });
                    }}
                    onOpen={openTask}
                    isPending={setStatus.isPending}
                  />
                  {card.task.dueTime === undefined ? null : (
                    <AppText tone="muted">{card.task.dueTime}</AppText>
                  )}
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="display">{t("views.upcoming.title")}</AppText>
          <AppText tone="muted">{t("views.upcoming.hint")}</AppText>
        </View>
        {renderBody()}
      </View>
    </Screen>
  );
}
