import type { Task, TodaySection } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { TaskCard } from "../../tasks/components/TaskCard";
import { useSetViewTaskStatus, useToday, useTogglePin } from "../api/use-views";
import { formatDuration } from "../utils/format-duration";
import { formatDay } from "../utils/format-day";
import { ViewEmpty, ViewError, ViewLoading } from "./ViewStates";

// RF-31 : quatre sections actives + une section repliée « Accomplies », une
// charge globale, et l'épingle sur chaque carte pour garder une tâche sans
// échéance dans Aujourd'hui.
export function TodayScreen() {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const todayQuery = useToday();
  const setStatus = useSetViewTaskStatus();
  const togglePin = useTogglePin();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function openTask(task: Task): void {
    router.push({ pathname: "/tasks/[id]", params: { id: task.id } });
  }

  function isCollapsed(section: TodaySection): boolean {
    return collapsed[section.key] ?? section.collapsedByDefault;
  }

  function renderSection(section: TodaySection) {
    const open = !isCollapsed(section);
    return (
      <View key={section.key} style={{ gap: theme.spacing.xs }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={t(open ? "views.today.collapse" : "views.today.expand", {
            section: t(`views.today.sections.${section.key}`),
          })}
          onPress={() =>
            setCollapsed((current) => ({ ...current, [section.key]: open }))
          }
          style={{
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: theme.spacing.sm,
            borderBottomWidth: theme.border.width,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText tone="title">
              {t(`views.today.sections.${section.key}`)}
            </AppText>
            <AppText tone="muted">
              {t("views.today.sectionMeta", {
                count: section.count,
                duration: formatDuration(section.estimateMinutes),
              })}
            </AppText>
          </View>
          <AppText tone="muted">{open ? "▾" : "▸"}</AppText>
        </Pressable>

        {open
          ? section.tasks.map((card) => (
              <View key={card.task.id} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
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
                  {card.subtaskCount === 0 ? null : (
                    <AppText tone="muted">
                      {t("views.subtasks", {
                        done: card.subtaskDoneCount,
                        total: card.subtaskCount,
                      })}
                    </AppText>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: card.task.pinned }}
                  accessibilityLabel={t(
                    card.task.pinned ? "views.today.unpin" : "views.today.pin",
                    { title: card.task.title },
                  )}
                  onPress={() => togglePin.mutate(card.task)}
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AppText tone="muted">{card.task.pinned ? "★" : "☆"}</AppText>
                </Pressable>
              </View>
            ))
          : null}
      </View>
    );
  }

  function renderBody() {
    if (todayQuery.status === "pending") {
      return <ViewLoading messageKey="views.today.loading" />;
    }
    if (todayQuery.status === "error") {
      return (
        <ViewError
          titleKey="views.today.error.title"
          error={todayQuery.error}
          onRetry={() => {
            void todayQuery.refetch();
          }}
        />
      );
    }
    if (todayQuery.data.sections.length === 0) {
      return (
        <ViewEmpty titleKey="views.today.empty.title" bodyKey="views.today.empty.body" />
      );
    }

    return (
      <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        {todayQuery.data.sections.map(renderSection)}
      </ScrollView>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="display">{t("views.today.title")}</AppText>
          <AppText tone="muted">
            {formatDay(todayQuery.data?.date ?? new Date().toISOString().slice(0, 10), i18n.language, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </AppText>
          {todayQuery.status === "success" ? (
            <AppText tone="muted">
              {t("views.today.load", {
                count: todayQuery.data.loadTaskCount,
                duration: formatDuration(todayQuery.data.loadMinutes),
              })}
            </AppText>
          ) : null}
        </View>

        {togglePin.isError ? (
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {t("views.today.pinError")}
          </AppText>
        ) : null}

        {renderBody()}
      </View>
    </Screen>
  );
}
