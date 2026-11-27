import {
  MAX_SUBTASKS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  hhmmSchema,
  isoDateSchema,
  taskTitleSchema,
  type RecurrenceMode,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useProjects } from "../../projects/api/use-projects";
import { useEnsureTags, useTags } from "../../tags/api/use-tags";
import {
  useCreateTask,
  useDeleteTask,
  useSetTaskStatus,
  useTask,
  useTasks,
  useUpdateTask,
} from "../api/use-tasks";
import type { TaskPatchInput } from "../../../data/tasks/task-repository";

type RecurrencePreset = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
const RECURRENCE_PRESETS: readonly RecurrencePreset[] = [
  "NONE",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
];

function presetOf(rule: string | undefined): RecurrencePreset {
  if (rule === undefined) return "NONE";
  if (rule.includes("FREQ=DAILY")) return "DAILY";
  if (rule.includes("FREQ=WEEKLY")) return "WEEKLY";
  if (rule.includes("FREQ=MONTHLY")) return "MONTHLY";
  if (rule.includes("FREQ=YEARLY")) return "YEARLY";
  return "NONE";
}

function buildRule(preset: RecurrencePreset, interval: number, dueDate: string): string | undefined {
  if (preset === "NONE") return undefined;
  const base = dueDate.length > 0 ? new Date(`${dueDate}T00:00:00`) : new Date();
  const weekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][base.getDay()] ?? "MO";
  const every = `;INTERVAL=${Math.max(1, interval)}`;
  if (preset === "DAILY") return `RRULE:FREQ=DAILY${every}`;
  if (preset === "WEEKLY") return `RRULE:FREQ=WEEKLY;BYDAY=${weekday}${every}`;
  if (preset === "MONTHLY") return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${base.getDate()}${every}`;
  return `RRULE:FREQ=YEARLY${every}`;
}

export function TaskDetailScreen({ taskId }: { readonly taskId: string }) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const taskQuery = useTask(taskId);

  if (taskQuery.status === "pending") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("tasks.loading")}</AppText>
        </View>
      </Screen>
    );
  }

  if (taskQuery.status === "error") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <AppText tone="title">{t("tasks.error.title")}</AppText>
          <AppText tone="muted">{t(appErrorMessageKey(taskQuery.error))}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tasks.error.retry")}
            onPress={() => void taskQuery.refetch()}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <AppText>{t("tasks.error.retry")}</AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return <TaskEditForm key={`${taskQuery.data.id}:${taskQuery.data.version}`} task={taskQuery.data} />;
}

function TaskEditForm({ task }: { readonly task: Task }) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const projectsQuery = useProjects();
  const tagsQuery = useTags();
  const ensureTags = useEnsureTags();
  const subtasksQuery = useTasks({ parentId: task.id, includeCompleted: true, limit: 100, sort: "MANUAL" });
  const createTask = useCreateTask();
  const setTaskStatus = useSetTaskStatus();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [projectId, setProjectId] = useState<string | null>(task.projectId ?? null);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task.dueTime ?? "");
  const [startDate, setStartDate] = useState(task.startDate ?? "");
  const [estimate, setEstimate] = useState(task.estimateMinutes?.toString() ?? "");
  const [tagIds, setTagIds] = useState<string[]>(task.tagIds);
  const [newTag, setNewTag] = useState("");
  const [reminders, setReminders] = useState<string[]>(task.reminders);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>(
    presetOf(task.recurrenceRule),
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceRule, setRecurrenceRule] = useState(task.recurrenceRule ?? "");
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>(task.recurrenceMode);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tags = tagsQuery.status === "success" ? tagsQuery.data : [];
  const projects = projectsQuery.status === "success" ? projectsQuery.data : [];
  const subtasks = subtasksQuery.status === "success" ? subtasksQuery.data.items : [];
  const allSubtasksDone =
    subtasks.length > 0 && subtasks.every((subtask) => subtask.status === "DONE");

  function submit(): void {
    if (!taskTitleSchema.safeParse(title).success) {
      setLocalError(t("tasks.detail.errors.title"));
      return;
    }
    if (dueDate.length > 0 && !isoDateSchema.safeParse(dueDate).success) {
      setLocalError(t("tasks.detail.errors.dueDate"));
      return;
    }
    if (dueTime.length > 0 && !hhmmSchema.safeParse(dueTime).success) {
      setLocalError(t("tasks.detail.errors.time"));
      return;
    }
    if (startDate.length > 0 && !isoDateSchema.safeParse(startDate).success) {
      setLocalError(t("tasks.detail.errors.startDate"));
      return;
    }

    const minutes = Number(estimate);
    const patch: TaskPatchInput = {
      title,
      description: description.trim().length === 0 ? null : description,
      status,
      priority,
      projectId,
      dueDate: dueDate.length === 0 ? null : dueDate,
      dueTime: dueTime.length === 0 ? null : dueTime,
      startDate: startDate.length === 0 ? null : startDate,
      estimateMinutes:
        estimate.trim().length === 0 || !Number.isFinite(minutes) || minutes <= 0
          ? null
          : Math.round(minutes),
      tagIds,
      reminders,
      recurrenceRule: recurrenceRule.length === 0 ? null : recurrenceRule,
      recurrenceMode,
    };

    setLocalError(null);
    updateTask.mutate(
      { task, patch },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );
  }

  async function addTag(): Promise<void> {
    if (newTag.trim().length === 0) return;
    const created = await ensureTags.mutateAsync([newTag.trim()]);
    setTagIds((current) => [...new Set([...current, ...created.map((tag) => tag.id)])]);
    setNewTag("");
  }

  function addReminder(): void {
    if (reminderDate.length === 0 || reminderTime.length === 0) return;
    const date = new Date(`${reminderDate}T${reminderTime}:00`);
    if (Number.isNaN(date.getTime())) return;
    setReminders((current) => [...new Set([...current, date.toISOString()])]);
    setReminderDate("");
    setReminderTime("");
  }

  async function addSubtask(): Promise<void> {
    const trimmed = subtaskTitle.trim();
    if (trimmed.length === 0) return;
    await createTask.mutateAsync({ title: trimmed, parentId: task.id });
    setSubtaskTitle("");
  }

  const message =
    localError ??
    (updateTask.isError
      ? appErrorMessageKey(updateTask.error)
      : deleteTask.isError
        ? appErrorMessageKey(deleteTask.error)
        : createTask.isError
          ? appErrorMessageKey(createTask.error)
          : null);

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <AppText tone="display">{t("tasks.detail.title")}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tasks.detail.cancel")}
            onPress={() => router.back()}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <AppText tone="muted">{t("tasks.detail.cancel")}</AppText>
          </Pressable>
        </View>

        <Field label={t("tasks.detail.fields.title")} value={title} onChangeText={setTitle} />
        <Field
          label={t("tasks.detail.fields.description")}
          value={description}
          onChangeText={setDescription}
          multiline
          hint={t("tasks.detail.richTextHint")}
        />
        {description.trim().length === 0 ? null : <DescriptionPreview text={description} />}

        <AppText tone="muted">{t("tasks.detail.fields.status")}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
          {TASK_STATUSES.map((value) => (
            <Choice
              key={value}
              label={t(`tasks.status.${value}`)}
              selected={status === value}
              onPress={() => setStatus(value)}
            />
          ))}
        </View>

        <AppText tone="muted">{t("tasks.detail.fields.priority")}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
          {TASK_PRIORITIES.map((value) => (
            <Choice
              key={value}
              label={t(`tasks.priority.${value}`)}
              selected={priority === value}
              onPress={() => setPriority(value)}
            />
          ))}
        </View>

        <AppText tone="muted">{t("tasks.detail.fields.project")}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
          <Choice
            label={t("tasks.detail.inbox")}
            selected={projectId === null}
            onPress={() => setProjectId(null)}
          />
          {projects.map((project) => (
            <Choice
              key={project.id}
              label={project.name}
              selected={projectId === project.id}
              onPress={() => setProjectId(project.id)}
            />
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" }}>
          <Field label={t("tasks.detail.fields.dueDate")} value={dueDate} onChangeText={setDueDate} placeholder="2026-12-01" />
          <Field label={t("tasks.detail.fields.dueTime")} value={dueTime} onChangeText={setDueTime} placeholder="09:30" />
          <Field label={t("tasks.detail.fields.startDate")} value={startDate} onChangeText={setStartDate} placeholder="2026-11-28" />
        </View>

        <Field
          label={t("tasks.detail.fields.estimate")}
          value={estimate}
          onChangeText={setEstimate}
          placeholder="45"
          keyboardType="number-pad"
        />

        <AppText tone="muted">{t("tasks.detail.fields.tags")}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
          {tags.map((tag) => (
            <Choice
              key={tag.id}
              label={`#${tag.name}`}
              selected={tagIds.includes(tag.id)}
              onPress={() =>
                setTagIds((current) =>
                  current.includes(tag.id)
                    ? current.filter((id) => id !== tag.id)
                    : [...current, tag.id],
                )
              }
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Field label={t("tasks.detail.newTag")} value={newTag} onChangeText={setNewTag} />
          <Button label={t("tasks.detail.addTag")} onPress={() => void addTag()} />
        </View>

        <AppText tone="muted">{t("tasks.detail.fields.reminders")}</AppText>
        {reminders.map((reminder) => (
          <View key={reminder} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <AppText tone="muted">{reminder}</AppText>
            <Choice
              label={t("tasks.detail.removeReminder")}
              selected={false}
              onPress={() => setReminders((current) => current.filter((item) => item !== reminder))}
            />
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Field label={t("tasks.detail.reminderDate")} value={reminderDate} onChangeText={setReminderDate} placeholder="2026-11-30" />
          <Field label={t("tasks.detail.reminderTime")} value={reminderTime} onChangeText={setReminderTime} placeholder="08:00" />
          <Button label={t("tasks.detail.addReminder")} onPress={addReminder} />
        </View>

        <AppText tone="muted">{t("tasks.detail.fields.recurrence")}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
          {RECURRENCE_PRESETS.map((preset) => (
            <Choice
              key={preset}
              label={t(`tasks.recurrence.presets.${preset}`)}
              selected={recurrencePreset === preset}
              onPress={() => {
                setRecurrencePreset(preset);
                const rule = buildRule(preset, recurrenceInterval, dueDate);
                setRecurrenceRule(rule ?? "");
              }}
            />
          ))}
        </View>
        <Field
          label={t("tasks.detail.recurrenceInterval")}
          value={recurrenceInterval.toString()}
          onChangeText={(value) => {
            const interval = Number(value);
            setRecurrenceInterval(Number.isFinite(interval) ? Math.max(1, interval) : 1);
          }}
          keyboardType="number-pad"
        />
        <Field
          label={t("tasks.detail.recurrenceRule")}
          value={recurrenceRule}
          onChangeText={setRecurrenceRule}
          placeholder="RRULE:FREQ=WEEKLY;BYDAY=MO"
        />
        <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
          {(["FIXED", "AFTER_COMPLETION"] as const).map((mode) => (
            <Choice
              key={mode}
              label={t(`tasks.recurrence.modes.${mode}`)}
              selected={recurrenceMode === mode}
              onPress={() => setRecurrenceMode(mode)}
            />
          ))}
        </View>

        <AppText tone="title">{t("tasks.detail.subtasks.title")}</AppText>
        {subtasksQuery.status === "pending" ? <ActivityIndicator color={theme.colors.accent} /> : null}
        {subtasks.map((subtask) => (
          <View key={subtask.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            <Choice
              label={subtask.status === "DONE" ? t("tasks.status.DONE") : t("tasks.status.TODO")}
              selected={subtask.status === "DONE"}
              onPress={() =>
                setTaskStatus.mutate({
                  task: subtask,
                  status: subtask.status === "DONE" ? "TODO" : "DONE",
                })
              }
            />
            <AppText style={{ flex: 1 }}>{subtask.title}</AppText>
          </View>
        ))}
        {subtasks.length < MAX_SUBTASKS ? (
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Field label={t("tasks.detail.subtasks.add")} value={subtaskTitle} onChangeText={setSubtaskTitle} />
            <Button label={t("tasks.detail.subtasks.submit")} onPress={() => void addSubtask()} />
          </View>
        ) : null}
        {allSubtasksDone && task.status !== "DONE" ? (
          <Button
            label={t("tasks.detail.subtasks.suggestDone")}
            onPress={() => setTaskStatus.mutate({ task, status: "DONE" })}
          />
        ) : null}

        {message === null ? null : (
          <AppText accessibilityLiveRegion="polite" tone="muted" style={{ color: theme.colors.state.danger }}>
            {t(message)}
          </AppText>
        )}

        <Button
          label={t("tasks.detail.save")}
          pending={updateTask.isPending}
          onPress={submit}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmDelete ? t("tasks.detail.confirmDelete") : t("tasks.detail.delete")}
          onPress={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            deleteTask.mutate(task, {
              onSuccess: () => {
                router.back();
              },
            });
          }}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            borderWidth: theme.border.width,
            borderColor: theme.colors.state.danger,
          }}
        >
          <AppText style={{ color: theme.colors.state.danger }}>
            {confirmDelete ? t("tasks.detail.confirmDelete") : t("tasks.detail.delete")}
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  hint,
  placeholder,
  keyboardType,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly multiline?: boolean;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly keyboardType?: "default" | "number-pad";
}) {
  const theme = useFocusTheme();
  return (
    <View style={{ flex: 1, minWidth: 140, gap: theme.spacing.xs }}>
      <AppText tone="muted">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline === true}
        placeholder={placeholder}
        keyboardType={keyboardType ?? "default"}
        placeholderTextColor={theme.colors.text.muted}
        style={{
          minHeight: multiline === true ? 96 : 44,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: multiline === true ? theme.spacing.sm : 0,
          borderRadius: theme.radii.md,
          borderWidth: theme.border.width,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.bg.surface,
          color: theme.colors.text.primary,
          textAlignVertical: multiline === true ? "top" : "center",
        }}
      />
      {hint === undefined ? null : <AppText tone="muted">{hint}</AppText>}
    </View>
  );
}

function Choice({
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
        borderWidth: selected ? 2 : theme.border.width,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
      }}
    >
      <AppText tone={selected ? "body" : "muted"}>{label}</AppText>
    </Pressable>
  );
}

function Button({
  label,
  onPress,
  pending,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly pending?: boolean;
}) {
  const theme = useFocusTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: pending === true }}
      disabled={pending === true}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: theme.spacing.lg,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.accent,
        opacity: pending === true ? 0.6 : 1,
      }}
    >
      {pending === true ? (
        <ActivityIndicator color={theme.colors.text.onAccent} />
      ) : (
        <AppText style={{ color: theme.colors.text.onAccent }}>{label}</AppText>
      )}
    </Pressable>
  );
}

function DescriptionPreview({ text }: { readonly text: string }) {
  const theme = useFocusTheme();
  return (
    <View
      style={{
        gap: theme.spacing.xs,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.bg.surface,
      }}
    >
      {text.split("\n").map((line, index) => {
        const checkbox = /^- \[( |x)\] (.*)$/i.exec(line);
        const bullet = /^- (.*)$/.exec(line);
        const content = checkbox?.[2] ?? bullet?.[1] ?? line;
        return (
          <AppText key={`${index}-${line}`} tone={line.length === 0 ? "muted" : "body"}>
            {checkbox === null ? (bullet === null ? null : "• ") : `${checkbox[1] === "x" ? "☑" : "☐"} `}
            <InlineMarkdown text={content} />
          </AppText>
        );
      })}
    </View>
  );
}

function InlineMarkdown({ text }: { readonly text: string }) {
  const theme = useFocusTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={`${index}-${part}`} style={{ fontWeight: "700" }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return (
            <Text key={`${index}-${part}`} style={{ fontStyle: "italic" }}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link !== null) {
          return (
            <Text key={`${index}-${part}`} style={{ color: theme.colors.accent, textDecorationLine: "underline" }}>
              {link[1]}
            </Text>
          );
        }
        return <Text key={`${index}-${part}`}>{part}</Text>;
      })}
    </>
  );
}
