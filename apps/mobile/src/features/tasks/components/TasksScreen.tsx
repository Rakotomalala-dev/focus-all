import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type DueFilter,
  type Task,
  type TaskListQuery,
  type TaskPriority,
  type TaskSort,
  type TaskStatus,
} from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useLogout, useSession } from "../../auth/api/use-auth";
import { useProjects } from "../../projects/api/use-projects";
import { useEnsureTags, useTags } from "../../tags/api/use-tags";
import {
  useCreateTask,
  useEmptyInbox,
  useReorderTasks,
  useSetTaskStatus,
  useTasks,
} from "../api/use-tasks";
import { parseQuickTask } from "../utils/parse-quick-task";
import { TaskCard } from "./TaskCard";
import { TaskComposer } from "./TaskComposer";

const SORTS: readonly TaskSort[] = ["MANUAL", "DUE_DATE", "PRIORITY", "CREATED_AT", "TITLE"];
const DUE_FILTERS: readonly DueFilter[] = ["OVERDUE", "TODAY", "NEXT_7_DAYS", "NONE"];

type FilterState = {
  readonly q: string;
  readonly status?: TaskStatus | undefined;
  readonly priority?: TaskPriority | undefined;
  readonly due?: DueFilter | undefined;
  readonly tagId?: string | undefined;
  readonly projectId?: string | undefined;
  readonly inbox?: boolean | undefined;
};

export function TasksScreen() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useSession();
  const logout = useLogout();
  const projectsQuery = useProjects();
  const tagsQuery = useTags();
  const ensureTags = useEnsureTags();
  const [filters, setFilters] = useState<FilterState>({ q: "" });
  const [sort, setSort] = useState<TaskSort>("MANUAL");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [inboxProjectId, setInboxProjectId] = useState<string | null>(null);

  const query = useMemo<TaskListQuery>(
    () => ({
      limit: 100,
      sort,
      includeCompleted,
      ...(filters.q.trim().length === 0 ? {} : { q: filters.q.trim() }),
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.priority === undefined ? {} : { priority: filters.priority }),
      ...(filters.due === undefined ? {} : { due: filters.due }),
      ...(filters.tagId === undefined ? {} : { tagIds: [filters.tagId] }),
      ...(filters.projectId === undefined ? {} : { projectId: filters.projectId }),
      ...(filters.inbox === undefined ? {} : { inbox: filters.inbox }),
    }),
    [filters, includeCompleted, sort],
  );

  const tasksQuery = useTasks(query);
  const createTask = useCreateTask();
  const setStatus = useSetTaskStatus();
  const reorder = useReorderTasks();
  const emptyInbox = useEmptyInbox();

  const parsingEnabled = user?.quickAddParsingEnabled ?? true;
  const quick = useMemo(
    () =>
      parsingEnabled && composerText.trim().length > 0
        ? parseQuickTask(composerText, { now: new Date() })
        : null,
    [composerText, parsingEnabled],
  );

  const preview = useMemo(() => {
    if (quick === null) return [];
    return [
      ...(quick.dueDate === undefined
        ? []
        : [
            t("tasks.quick.due", {
              date: quick.dueTime === undefined ? quick.dueDate : `${quick.dueDate} ${quick.dueTime}`,
            }),
          ]),
      ...(quick.priority === "NONE"
        ? []
        : [t("tasks.quick.priority", { priority: t(`tasks.priority.${quick.priority}`) })]),
      ...quick.tagNames.map((name) => t("tasks.quick.tag", { name })),
      ...(quick.projectName === undefined
        ? []
        : [t("tasks.quick.project", { name: quick.projectName })]),
      ...(quick.recurrenceRule === undefined ? [] : [t("tasks.quick.recurrence")]),
    ];
  }, [quick, t]);

  async function handleCreate(input: string): Promise<void> {
    const parsed = parsingEnabled
      ? parseQuickTask(input, { now: new Date() })
      : { title: input.trim(), priority: "NONE" as const, tagNames: [] };

    const project = projectsQuery.data?.find(
      (item) => item.name.toLocaleLowerCase("fr") === parsed.projectName?.toLocaleLowerCase("fr"),
    );
    const title =
      parsed.projectName !== undefined && project === undefined
        ? `${parsed.title} @${parsed.projectName}`.trim()
        : parsed.title;

    // Les tags `#nom` sont créés à la volée : la saisie rapide ne bloque jamais
    // sur un formulaire de tag.
    const ensured =
      parsed.tagNames.length === 0 ? [] : await ensureTags.mutateAsync(parsed.tagNames);
    await createTask.mutateAsync({
      title: title.length === 0 ? input.trim() : title,
      priority: parsed.priority,
      tagIds: ensured.map((tag) => tag.id),
      ...(parsed.dueDate === undefined ? {} : { dueDate: parsed.dueDate }),
      ...("dueTime" in parsed && parsed.dueTime !== undefined ? { dueTime: parsed.dueTime } : {}),
      ...(parsed.recurrenceRule === undefined
        ? {}
        : { recurrenceRule: parsed.recurrenceRule }),
      ...(project === undefined ? {} : { projectId: project.id }),
    });
    setComposerText("");
  }

  function move(task: Task, direction: -1 | 1): void {
    const items = tasksQuery.data?.items ?? [];
    const index = items.findIndex((item) => item.id === task.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) return;
    ids.splice(target, 0, moved);
    reorder.mutate(ids);
  }

  function clearFilters(): void {
    setFilters({ q: "" });
    setIncludeCompleted(false);
    setSort("MANUAL");
  }

  function renderBody() {
    if (tasksQuery.status === "pending") {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("tasks.loading")}</AppText>
        </View>
      );
    }

    if (tasksQuery.status === "error") {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <AppText tone="title">{t("tasks.error.title")}</AppText>
          <AppText tone="muted" style={{ textAlign: "center" }}>
            {t(appErrorMessageKey(tasksQuery.error))}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tasks.error.retry")}
            onPress={() => void tasksQuery.refetch()}
            style={{ minHeight: 44, paddingHorizontal: theme.spacing.lg, justifyContent: "center" }}
          >
            <AppText>{t("tasks.error.retry")}</AppText>
          </Pressable>
        </View>
      );
    }

    const { items } = tasksQuery.data;
    if (items.length === 0) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.xs }}>
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
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <TaskCard
                task={item}
                onToggle={(task) => {
                  setStatus.mutate({ task, status: task.status === "DONE" ? "TODO" : "DONE" });
                }}
                onOpen={(task) => {
                  router.push({ pathname: "/tasks/[id]", params: { id: task.id } });
                }}
                onLongPress={() => setReorderMode(true)}
                isPending={setStatus.isPending}
              />
            </View>
            {reorderMode ? (
              <View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("tasks.reorder.up", { title: item.title })}
                  onPress={() => move(item, -1)}
                  style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}
                >
                  <AppText>↑</AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("tasks.reorder.down", { title: item.title })}
                  onPress={() => move(item, 1)}
                  style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}
                >
                  <AppText>↓</AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
      />
    );
  }

  const projects = projectsQuery.status === "success" ? projectsQuery.data : [];
  const tags = tagsQuery.status === "success" ? tagsQuery.data : [];

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <View style={{ flex: 1, minWidth: 180, gap: theme.spacing.xs }}>
            <AppText tone="display">{t("tasks.title")}</AppText>
            {user === null ? null : (
              <AppText tone="muted">{t("auth.greeting", { name: user.displayName })}</AppText>
            )}
            <AppText tone="muted">
              {t("tasks.count", { count: tasksQuery.data?.items.length ?? 0 })}
            </AppText>
          </View>
          <HeaderButton label={t("tasks.card.projects")} onPress={() => router.push("/projects")} />
          <HeaderButton label={t("tags.title")} onPress={() => router.push("/tags")} />
          <HeaderButton label={t("tasks.trash.open")} onPress={() => router.push("/trash")} />
          <HeaderButton label={t("settings.open")} onPress={() => router.push("/settings")} />
          <HeaderButton
            label={t("auth.logout")}
            disabled={logout.isPending}
            onPress={() => logout.mutate()}
          />
        </View>

        <TaskComposer
          onCreate={handleCreate}
          isSubmitting={createTask.isPending}
          onTextChange={setComposerText}
          preview={preview}
        />

        {createTask.isError ? (
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {t(appErrorMessageKey(createTask.error))}
          </AppText>
        ) : null}

        <TextInput
          accessibilityLabel={t("tasks.filters.search")}
          placeholder={t("tasks.filters.search")}
          placeholderTextColor={theme.colors.text.muted}
          value={filters.q}
          onChangeText={(q) => setFilters((current) => ({ ...current, q }))}
          style={{
            minHeight: 44,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radii.md,
            borderWidth: theme.border.width,
            borderColor: theme.colors.border,
            color: theme.colors.text.primary,
          }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
            <Chip
              label={t("tasks.filters.all")}
              selected={filters.status === undefined}
                onPress={() =>
                  setFilters(({ status: _status, ...current }) => current as FilterState)
                }
            />
            {TASK_STATUSES.map((status) => (
              <Chip
                key={status}
                label={t(`tasks.status.${status}`)}
                selected={filters.status === status}
                onPress={() =>
                  setFilters((current) => ({ ...current, status }))
                }
              />
            ))}
            {TASK_PRIORITIES.filter((priority) => priority !== "NONE").map((priority) => (
              <Chip
                key={priority}
                label={t(`tasks.priority.${priority}`)}
                selected={filters.priority === priority}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    ...(current.priority === priority
                      ? { priority: undefined }
                      : { priority }),
                  }))
                }
              />
            ))}
            {DUE_FILTERS.map((due) => (
              <Chip
                key={due}
                label={t(`tasks.filters.due.${due}`)}
                selected={filters.due === due}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    ...(current.due === due ? { due: undefined } : { due }),
                  }))
                }
              />
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
            <Chip
              label={t("tasks.filters.includeCompleted")}
              selected={includeCompleted}
              onPress={() => setIncludeCompleted((value) => !value)}
            />
            {SORTS.map((value) => (
              <Chip
                key={value}
                label={t(`tasks.sort.${value}`)}
                selected={sort === value}
                onPress={() => setSort(value)}
              />
            ))}
            <Chip
              label={t("tasks.reorder.toggle")}
              selected={reorderMode}
              onPress={() => setReorderMode((value) => !value)}
            />
            <Chip label={t("tasks.filters.clear")} selected={false} onPress={clearFilters} />
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
            {projects.map((project) => (
              <Chip
                key={project.id}
                label={project.name}
                selected={filters.projectId === project.id}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    inbox: undefined,
                    ...(current.projectId === project.id
                      ? { projectId: undefined }
                      : { projectId: project.id }),
                  }))
                }
              />
            ))}
            <Chip
              label={t("tasks.filters.inbox")}
                selected={filters.inbox === true}
              onPress={() =>
                setFilters((current) => ({
                  ...current,
                    projectId: undefined,
                    inbox: current.inbox === true ? undefined : true,
                }))
              }
            />
          </View>
        </ScrollView>

        {tags.length === 0 ? null : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
              {tags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={`#${tag.name}`}
                  selected={filters.tagId === tag.id}
                  onPress={() =>
                    setFilters((current) => ({
                      ...current,
                      ...(current.tagId === tag.id ? { tagId: undefined } : { tagId: tag.id }),
                    }))
                  }
                />
              ))}
            </View>
          </ScrollView>
        )}

        {filters.inbox === true && projects.length > 0 ? (
          <View style={{ gap: theme.spacing.xs }}>
            <AppText tone="muted">{t("tasks.inbox.emptyHint")}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
                {projects.map((project) => (
                  <Chip
                    key={project.id}
                    label={project.name}
                    selected={inboxProjectId === project.id}
                    onPress={() => setInboxProjectId(project.id)}
                  />
                ))}
                <Chip
                  label={t("tasks.inbox.empty")}
                  selected={false}
                  onPress={() => {
                    if (inboxProjectId !== null) emptyInbox.mutate(inboxProjectId);
                  }}
                />
              </View>
            </ScrollView>
          </View>
        ) : null}

        {renderBody()}
      </View>
    </Screen>
  );
}

function HeaderButton({
  label,
  onPress,
  disabled,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  const theme = useFocusTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled === true}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: theme.spacing.md,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radii.md,
        borderWidth: theme.border.width,
        borderColor: theme.colors.border,
        opacity: disabled === true ? 0.6 : 1,
      }}
    >
      <AppText tone="muted">{label}</AppText>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const theme = useFocusTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: theme.spacing.md,
        justifyContent: "center",
        borderRadius: theme.radii.md,
        borderWidth: theme.border.width,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : undefined,
      }}
    >
      <AppText style={selected ? { color: theme.colors.text.onAccent } : undefined}>{label}</AppText>
    </Pressable>
  );
}
