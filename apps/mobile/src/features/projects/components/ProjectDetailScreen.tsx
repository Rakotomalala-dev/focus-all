import {
  PROJECT_COLORS,
  projectNameSchema,
  type Project,
  type ProjectColor,
} from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import type { ProjectPatchInput } from "../../../data/projects/project-repository";
import { useDeleteProject, useProjects, useUpdateProject } from "../api/use-projects";

type ProjectForm = {
  readonly name: string;
  readonly description: string;
  readonly color: ProjectColor | null;
};

export function ProjectDetailScreen({ projectId }: { readonly projectId: string }) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const projectsQuery = useProjects();
  const project =
    projectsQuery.status === "success"
      ? projectsQuery.data.find((item) => item.id === projectId)
      : undefined;

  if (projectsQuery.status === "pending") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("projects.loading")}</AppText>
        </View>
      </Screen>
    );
  }

  if (projectsQuery.status === "error") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <AppText tone="title">{t("projects.error.title")}</AppText>
          <AppText tone="muted">{t(appErrorMessageKey(projectsQuery.error))}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("projects.error.retry")}
            onPress={() => {
              void projectsQuery.refetch();
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
            <AppText>{t("projects.error.retry")}</AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (project === undefined) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.xs }}>
          <AppText tone="title">{t("projects.notFound.title")}</AppText>
          <AppText tone="muted">{t("projects.notFound.body")}</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <ProjectEditForm
      key={`${project.id}:${project.version}`}
      project={project}
      onDeleted={() => {
        router.back();
      }}
    />
  );
}

function ProjectEditForm({
  project,
  onDeleted,
}: {
  readonly project: Project;
  readonly onDeleted: () => void;
}) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const [validationKey, setValidationKey] = useState<"projects.errors.name" | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const { control, handleSubmit } = useForm<ProjectForm>({
    defaultValues: {
      name: project.name,
      description: project.description ?? "",
      color: project.color,
    },
  });

  const submit = handleSubmit(async (values) => {
    if (!projectNameSchema.safeParse(values.name).success) {
      setValidationKey("projects.errors.name");
      return;
    }

    setValidationKey(null);
    const description = values.description.trim();
    const patch: ProjectPatchInput = {
      name: values.name,
      color: values.color,
      description: description.length === 0 ? null : description,
    };

    try {
      await updateProject.mutateAsync({ project, patch });
      router.back();
    } catch {
      // Erreur rendue sous le formulaire, y compris le conflit de version.
    }
  });

  async function toggleArchive(): Promise<void> {
    try {
      await updateProject.mutateAsync({
        project,
        patch: { archived: project.archivedAt === null },
      });
    } catch {
      // L'erreur est rendue par `updateProject.isError`.
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    try {
      await deleteProject.mutateAsync(project);
      onDeleted();
    } catch {
      // Idem : le bouton reste utilisable pour réessayer.
    }
  }

  const messageKey =
    validationKey ??
    (updateProject.isError
      ? appErrorMessageKey(updateProject.error)
      : deleteProject.isError
        ? appErrorMessageKey(deleteProject.error)
        : null);

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.lg }}>
        <AppText tone="display">{t("projects.detail.title")}</AppText>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText tone="muted">{t("projects.detail.fields.name")}</AppText>
          <Controller
            control={control}
            name="name"
            render={({ field: { onBlur, onChange, value } }) => (
              <TextInput
                accessibilityLabel={t("projects.detail.fields.name")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!updateProject.isPending}
                maxLength={80}
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
          <AppText tone="muted">{t("projects.detail.fields.description")}</AppText>
          <Controller
            control={control}
            name="description"
            render={({ field: { onBlur, onChange, value } }) => (
              <TextInput
                accessibilityLabel={t("projects.detail.fields.description")}
                multiline
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!updateProject.isPending}
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
          <AppText tone="muted">{t("projects.detail.fields.color")}</AppText>
          <Controller
            control={control}
            name="color"
            render={({ field: { onChange, value } }) => (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: value === null }}
                  accessibilityLabel={t("projects.colors.none")}
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
                  <AppText tone="muted">{t("projects.colors.none")}</AppText>
                </Pressable>
                {PROJECT_COLORS.map((color) => {
                  const isSelected = value === color;
                  return (
                    <Pressable
                      key={color}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={t(`projects.colors.${color}`)}
                      onPress={() => onChange(color)}
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
                      <AppText tone="muted">{t(`projects.colors.${color}`)}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        </View>

        {messageKey === null ? null : (
          <AppText accessibilityLiveRegion="polite" tone="muted" style={{ color: theme.colors.state.danger }}>
            {t(messageKey)}
          </AppText>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("projects.detail.save")}
          disabled={updateProject.isPending}
          onPress={() => {
            void submit();
          }}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.accent,
            opacity: updateProject.isPending ? 0.6 : 1,
          }}
        >
          {updateProject.isPending ? (
            <ActivityIndicator color={theme.colors.text.onAccent} />
          ) : (
            <AppText style={{ color: theme.colors.text.onAccent, fontWeight: "600" }}>
              {t("projects.detail.save")}
            </AppText>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            project.archivedAt === null ? t("projects.detail.archive") : t("projects.detail.unarchive")
          }
          disabled={updateProject.isPending}
          onPress={() => {
            void toggleArchive();
          }}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            borderWidth: theme.border.width,
            borderColor: theme.colors.border,
          }}
        >
          <AppText tone="muted">
            {project.archivedAt === null ? t("projects.detail.archive") : t("projects.detail.unarchive")}
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isConfirmingDelete ? t("projects.detail.confirmDelete") : t("projects.detail.delete")
          }
          disabled={deleteProject.isPending}
          onPress={() => {
            void confirmDelete();
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
          <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
            {isConfirmingDelete ? t("projects.detail.confirmDelete") : t("projects.detail.delete")}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}
