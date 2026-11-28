import { KANBAN_STATUSES, type KanbanStatus, type ViewCard } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useProjects } from "../../projects/api/use-projects";
import { formatDueDate } from "../../tasks/utils/format-due-date";
import { useKanban, useMoveCard } from "../api/use-views";
import { ViewEmpty, ViewError, ViewLoading } from "./ViewStates";

// RF-34 : trois colonnes fixes par projet. Le déplacement se fait par les
// flèches (le glisser-déposer est V1.1) ; il envoie statut + position au
// serveur, qui écrit le journal de synchronisation dans la même transaction.
export function KanbanScreen() {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const projectsQuery = useProjects();
  const [chosenProjectId, setChosenProjectId] = useState<string | null>(null);
  const moveCard = useMoveCard();

  const projects = (projectsQuery.data ?? []).filter((project) => project.archivedAt === null);
  const projectId = chosenProjectId ?? projects[0]?.id ?? null;
  const kanbanQuery = useKanban(projectId);
  const data = kanbanQuery.status === "success" ? kanbanQuery.data : undefined;

  function openTask(card: ViewCard): void {
    router.push({ pathname: "/tasks/[id]", params: { id: card.task.id } });
  }

  function move(card: ViewCard, direction: -1 | 1): void {
    if (data === undefined) return;
    const index = KANBAN_STATUSES.indexOf(card.task.status as KanbanStatus);
    const target = KANBAN_STATUSES[index + direction];
    if (target === undefined) return;
    moveCard.mutate({
      projectId: data.projectId,
      taskId: card.task.id,
      status: target,
      version: card.task.version,
    });
  }

  function renderProjects() {
    if (projects.length === 0) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
          {projects.map((project) => (
            <Pressable
              key={project.id}
              accessibilityRole="button"
              accessibilityState={{ selected: project.id === projectId }}
              accessibilityLabel={t("views.kanban.project", { name: project.name })}
              onPress={() => setChosenProjectId(project.id)}
              style={{
                minHeight: 44,
                paddingHorizontal: theme.spacing.md,
                justifyContent: "center",
                borderRadius: theme.radii.md,
                borderWidth: theme.border.width,
                borderColor: project.id === projectId ? theme.colors.accent : theme.colors.border,
                backgroundColor: project.id === projectId ? theme.colors.accent : undefined,
              }}
            >
              <AppText
                style={
                  project.id === projectId
                    ? { color: theme.colors.text.onAccent }
                    : undefined
                }
              >
                {project.name}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderCard(card: ViewCard) {
    const index = KANBAN_STATUSES.indexOf(card.task.status as KanbanStatus);
    const meta = [
      t(`tasks.priority.${card.task.priority}`),
      card.task.dueDate === undefined
        ? null
        : formatDueDate(card.task.dueDate, i18n.language),
      card.task.tagIds.length === 0
        ? null
        : t("views.kanban.tags", { count: card.task.tagIds.length }),
      card.subtaskCount === 0
        ? null
        : t("views.kanban.subtasks", {
            done: card.subtaskDoneCount,
            total: card.subtaskCount,
          }),
    ].filter((part): part is string => part !== null);

    return (
      <View
        key={card.task.id}
        style={{
          gap: theme.spacing.xs,
          padding: theme.spacing.sm,
          borderRadius: theme.radii.md,
          borderWidth: theme.border.width,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.bg.surface,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("views.kanban.open", { title: card.task.title })}
          onPress={() => openTask(card)}
          style={{ minHeight: 44, justifyContent: "center", gap: 2 }}
        >
          <AppText>{card.task.title}</AppText>
          <AppText tone="muted">{meta.join(" · ")}</AppText>
        </Pressable>

        <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
          {KANBAN_STATUSES[index - 1] === undefined ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("views.kanban.moveTo", {
                title: card.task.title,
                status: t(`tasks.status.${KANBAN_STATUSES[index - 1] ?? "TODO"}`),
              })}
              disabled={moveCard.isPending}
              onPress={() => move(card, -1)}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
            >
              <AppText tone="muted">←</AppText>
            </Pressable>
          )}
          {KANBAN_STATUSES[index + 1] === undefined ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("views.kanban.moveTo", {
                title: card.task.title,
                status: t(`tasks.status.${KANBAN_STATUSES[index + 1] ?? "DONE"}`),
              })}
              disabled={moveCard.isPending}
              onPress={() => move(card, 1)}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
            >
              <AppText tone="muted">→</AppText>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  function renderBody() {
    if (projectsQuery.status === "pending") {
      return <ViewLoading messageKey="views.kanban.loading" />;
    }
    if (projectsQuery.status === "error") {
      return (
        <ViewError
          titleKey="views.kanban.error.title"
          error={projectsQuery.error}
          onRetry={() => {
            void projectsQuery.refetch();
          }}
        />
      );
    }
    if (projects.length === 0) {
      return (
        <ViewEmpty titleKey="views.kanban.emptyProject.title" bodyKey="views.kanban.emptyProject.body" />
      );
    }
    if (kanbanQuery.status === "pending") {
      return <ViewLoading messageKey="views.kanban.loading" />;
    }
    if (kanbanQuery.status === "error") {
      return (
        <ViewError
          titleKey="views.kanban.error.title"
          error={kanbanQuery.error}
          onRetry={() => {
            void kanbanQuery.refetch();
          }}
        />
      );
    }
    if (data === undefined) {
      return null;
    }
    if (data.columns.every((column) => column.count === 0)) {
      return <ViewEmpty titleKey="views.kanban.empty.title" bodyKey="views.kanban.empty.body" />;
    }

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {data.columns.map((column) => (
            <View
              key={column.status}
              style={{
                width: 260,
                gap: theme.spacing.sm,
                padding: theme.spacing.sm,
                borderRadius: theme.radii.md,
                borderWidth: theme.border.width,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  borderBottomWidth: theme.border.width,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <AppText tone="title">{t(`tasks.status.${column.status}`)}</AppText>
                <AppText tone="muted">{t("views.kanban.columnCount", { count: column.count })}</AppText>
              </View>
              {column.tasks.map(renderCard)}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="display">{t("views.kanban.title")}</AppText>
          <AppText tone="muted">
            {data === undefined ? t("views.kanban.hint") : data.projectName}
          </AppText>
        </View>
        {renderProjects()}
        {moveCard.isError ? (
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {t("views.kanban.moveError")}
          </AppText>
        ) : null}
        {renderBody()}
      </View>
    </Screen>
  );
}
