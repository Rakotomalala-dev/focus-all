import {
  TASK_PRIORITIES,
  isoDateSchema,
  taskTitleSchema,
  type Task,
  type TaskPriority,
} from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import type { TaskPatchInput } from "../../../data/tasks/task-repository";
import { useProjects } from "../../projects/api/use-projects";
import { useTasks, useUpdateTask } from "../api/use-tasks";

type EditForm = {
  readonly title: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly dueDate: string;
  readonly projectId: string | null;
};

type ValidationKey = "tasks.detail.errors.title" | "tasks.detail.errors.dueDate";

// RF-21 : édition des champs disponibles côté serveur (titre, description,
// priorité, échéance). Projet, tags et récurrence arrivent avec leurs modules ;
// aucun champ n'est affiché tant qu'il ne peut pas être enregistré.
export function TaskDetailScreen({ taskId }: { readonly taskId: string }) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const tasksQuery = useTasks();
  const task =
    tasksQuery.status === "success"
      ? tasksQuery.data.items.find((item) => item.id === taskId)
      : undefined;

  if (tasksQuery.status === "pending") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("tasks.loading")}</AppText>
        </View>
      </Screen>
    );
  }

  if (tasksQuery.status === "error") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
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
      </Screen>
    );
  }

  if (task === undefined) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.xs }}>
          <AppText tone="title">{t("tasks.detail.notFound.title")}</AppText>
          <AppText tone="muted">{t("tasks.detail.notFound.body")}</AppText>
        </View>
      </Screen>
    );
  }

  // La clé inclut la version : après une sauvegarde, le formulaire repart des
  // valeurs serveur au lieu de garder des champs obsolètes.
  return (
    <TaskEditForm
      key={`${task.id}:${task.version}`}
      task={task}
      onSaved={() => {
        router.back();
      }}
      onCancel={() => {
        router.back();
      }}
    />
  );
}

function TaskEditForm({
  task,
  onSaved,
  onCancel,
}: {
  readonly task: Task;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const updateTask = useUpdateTask();
  const projectsQuery = useProjects();
  const [validationKey, setValidationKey] = useState<ValidationKey | null>(null);

  const { control, handleSubmit } = useForm<EditForm>({
    defaultValues: {
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      dueDate: task.dueDate ?? "",
      projectId: task.projectId ?? null,
    },
  });

  const submit = handleSubmit(async (values) => {
    if (!taskTitleSchema.safeParse(values.title).success) {
      setValidationKey("tasks.detail.errors.title");
      return;
    }

    const dueDate = values.dueDate.trim();
    if (dueDate.length > 0 && !isoDateSchema.safeParse(dueDate).success) {
      setValidationKey("tasks.detail.errors.dueDate");
      return;
    }

    const description = values.description.trim();
    const patch: TaskPatchInput = {
      title: values.title,
      priority: values.priority,
      projectId: values.projectId,
      ...(description.length === 0 ? {} : { description }),
      ...(dueDate.length === 0 ? {} : { dueDate }),
    };

    setValidationKey(null);
    try {
      await updateTask.mutateAsync({ task, patch });
      onSaved();
    } catch {
      // L'erreur est rendue sous le formulaire (conflit de version inclus).
    }
  });

  const messageKey =
    validationKey ?? (updateTask.isError ? appErrorMessageKey(updateTask.error) : null);

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText tone="display">{t("tasks.detail.title")}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tasks.detail.cancel")}
            onPress={onCancel}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
          >
            <AppText tone="muted">{t("tasks.detail.cancel")}</AppText>
          </Pressable>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted">{t("tasks.detail.fields.title")}</AppText>
          <Controller
            control={control}
            name="title"
            render={({ field: { onBlur, onChange, value } }) => (
              <TextInput
                accessibilityLabel={t("tasks.detail.fields.title")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!updateTask.isPending}
                style={{
                  minHeight: 44,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  borderWidth: theme.border.width,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.bg.surface,
                  color: theme.colors.text.primary,
                  fontFamily: theme.fontFamilies.text,
                  fontSize: theme.typography.md.size,
                }}
              />
            )}
          />
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted">{t("tasks.detail.fields.description")}</AppText>
          <Controller
            control={control}
            name="description"
            render={({ field: { onBlur, onChange, value } }) => (
              <TextInput
                accessibilityLabel={t("tasks.detail.fields.description")}
                multiline
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!updateTask.isPending}
                style={{
                  minHeight: 96,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radii.md,
                  borderWidth: theme.border.width,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.bg.surface,
                  color: theme.colors.text.primary,
                  fontFamily: theme.fontFamilies.text,
                  fontSize: theme.typography.md.size,
                  textAlignVertical: "top",
                }}
              />
            )}
          />
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted">{t("tasks.detail.fields.priority")}</AppText>
          <Controller
            control={control}
            name="priority"
            render={({ field: { onChange, value } }) => (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {TASK_PRIORITIES.map((priority) => {
                  const isSelected = value === priority;
                  return (
                    <Pressable
                      key={priority}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={t(`tasks.priority.${priority}`)}
                      onPress={() => onChange(priority)}
                      style={{
                        minHeight: 44,
                        paddingHorizontal: theme.spacing.md,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: theme.radii.md,
                        borderWidth: isSelected ? 2 : theme.border.width,
                        borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                      }}
                    >
                      <AppText tone="muted">{t(`tasks.priority.${priority}`)}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted">{t("tasks.detail.fields.dueDate")}</AppText>
          <Controller
            control={control}
            name="dueDate"
            render={({ field: { onBlur, onChange, value } }) => (
              <TextInput
                accessibilityLabel={t("tasks.detail.fields.dueDate")}
                placeholder={t("tasks.detail.dueDatePlaceholder")}
                placeholderTextColor={theme.colors.text.muted}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!updateTask.isPending}
                style={{
                  minHeight: 44,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  borderWidth: theme.border.width,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.bg.surface,
                  color: theme.colors.text.primary,
                  fontFamily: theme.fontFamilies.text,
                  fontSize: theme.typography.md.size,
                }}
              />
            )}
          />
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted">{t("tasks.detail.fields.project")}</AppText>
          <Controller
            control={control}
            name="projectId"
            render={({ field: { onChange, value } }) => (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: value === null }}
                  accessibilityLabel={t("tasks.detail.inbox")}
                  onPress={() => onChange(null)}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: theme.spacing.md,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: theme.radii.md,
                    borderWidth: value === null ? 2 : theme.border.width,
                    borderColor: value === null ? theme.colors.accent : theme.colors.border,
                  }}
                >
                  <AppText tone="muted">{t("tasks.detail.inbox")}</AppText>
                </Pressable>
                {projectsQuery.status === "success"
                  ? projectsQuery.data.map((project) => {
                      const isSelected = value === project.id;
                      return (
                        <Pressable
                          key={project.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={project.name}
                          onPress={() => onChange(project.id)}
                          style={{
                            minHeight: 44,
                            paddingHorizontal: theme.spacing.md,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: theme.radii.md,
                            borderWidth: isSelected ? 2 : theme.border.width,
                            borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                          }}
                        >
                          <AppText tone="muted">{project.name}</AppText>
                        </Pressable>
                      );
                    })
                  : null}
              </View>
            )}
          />
        </View>

        {messageKey === null ? null : (
          <AppText
            accessibilityLiveRegion="polite"
            tone="muted"
            style={{ color: theme.colors.state.danger }}
          >
            {t(messageKey)}
          </AppText>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tasks.detail.save")}
          disabled={updateTask.isPending}
          onPress={() => {
            void submit();
          }}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.accent,
            opacity: updateTask.isPending ? 0.6 : 1,
          }}
        >
          {updateTask.isPending ? (
            <ActivityIndicator color={theme.colors.text.onAccent} />
          ) : (
            <AppText style={{ color: theme.colors.text.onAccent, fontWeight: "600" }}>
              {t("tasks.detail.save")}
            </AppText>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}
