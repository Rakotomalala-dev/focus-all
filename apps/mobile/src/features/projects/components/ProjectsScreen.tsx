import { projectNameSchema } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useCreateProject, useProjects } from "../api/use-projects";

// RF-10 : liste, création et accès au détail. Les quatre états sont explicites ;
// la création reste en haut de l'écran pour ne pas cacher la liste.
export function ProjectsScreen() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const projectsQuery = useProjects();
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [isNameInvalid, setIsNameInvalid] = useState(false);

  async function handleCreate(): Promise<void> {
    if (!projectNameSchema.safeParse(name).success) {
      setIsNameInvalid(true);
      return;
    }
    setIsNameInvalid(false);
    try {
      await createProject.mutateAsync({ name });
      setName("");
    } catch {
      // L'erreur de mutation est affichée sous le formulaire.
    }
  }

  function renderBody() {
    if (projectsQuery.status === "pending") {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="muted">{t("projects.loading")}</AppText>
        </View>
      );
    }

    if (projectsQuery.status === "error") {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm }}>
          <AppText tone="title">{t("projects.error.title")}</AppText>
          <AppText tone="muted" style={{ textAlign: "center" }}>
            {t(appErrorMessageKey(projectsQuery.error))}
          </AppText>
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
      );
    }

    if (projectsQuery.data.length === 0) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.xs }}>
          <AppText tone="title">{t("projects.empty.title")}</AppText>
          <AppText tone="muted" style={{ textAlign: "center" }}>
            {t("projects.empty.body")}
          </AppText>
        </View>
      );
    }

    return (
      <FlatList
        data={projectsQuery.data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("projects.open", { name: item.name })}
            onPress={() => {
              router.push({ pathname: "/projects/[id]", params: { id: item.id } });
            }}
            style={{
              minHeight: 44,
              paddingVertical: theme.spacing.md,
              borderBottomWidth: theme.border.width,
              borderBottomColor: theme.colors.border,
              gap: theme.spacing.xs,
            }}
          >
            <AppText>{item.name}</AppText>
            <AppText tone="muted">
              {item.archivedAt === null ? t("projects.active") : t("projects.archived")}
            </AppText>
          </Pressable>
        )}
      />
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.lg }}>
        <AppText tone="display">{t("projects.title")}</AppText>

        <View style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            <TextInput
              accessibilityLabel={t("projects.create.label")}
              placeholder={t("projects.create.placeholder")}
              placeholderTextColor={theme.colors.text.muted}
              value={name}
              onChangeText={setName}
              editable={!createProject.isPending}
              maxLength={80}
              style={{
                flex: 1,
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("projects.create.submit")}
              disabled={createProject.isPending}
              onPress={() => {
                void handleCreate();
              }}
              style={{
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: theme.spacing.lg,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.accent,
                opacity: createProject.isPending ? 0.6 : 1,
              }}
            >
              <AppText style={{ color: theme.colors.text.onAccent, fontWeight: "600" }}>
                {t("projects.create.submit")}
              </AppText>
            </Pressable>
          </View>

          {isNameInvalid ? (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {t("projects.create.invalid")}
            </AppText>
          ) : null}
          {createProject.isError ? (
            <AppText tone="muted" style={{ color: theme.colors.state.danger }}>
              {t(appErrorMessageKey(createProject.error))}
            </AppText>
          ) : null}
        </View>

        {renderBody()}
      </View>
    </Screen>
  );
}
