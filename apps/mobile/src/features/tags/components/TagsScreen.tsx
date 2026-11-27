import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { appErrorMessageKey } from "../../../data/http/app-error";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from "../api/use-tags";

export function TagsScreen() {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const tagsQuery = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (tagsQuery.status === "pending") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (tagsQuery.status === "error") {
    return (
      <Screen>
        <AppText tone="title">{t("tags.error")}</AppText>
        <AppText tone="muted">{t(appErrorMessageKey(tagsQuery.error))}</AppText>
      </Screen>
    );
  }

  const message = createTag.isError
    ? appErrorMessageKey(createTag.error)
    : updateTag.isError
      ? appErrorMessageKey(updateTag.error)
      : deleteTag.isError
        ? appErrorMessageKey(deleteTag.error)
        : null;

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <AppText tone="display">{t("tags.title")}</AppText>
        <AppText tone="muted">{t("tags.hint")}</AppText>

        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <TextInput
            accessibilityLabel={t("tags.new")}
            placeholder={t("tags.new")}
            value={newName}
            onChangeText={setNewName}
            placeholderTextColor={theme.colors.text.muted}
            style={{
              flex: 1,
              minHeight: 44,
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radii.md,
              borderWidth: theme.border.width,
              borderColor: theme.colors.border,
              color: theme.colors.text.primary,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tags.create")}
            onPress={() => {
              if (newName.trim().length === 0) return;
              createTag.mutate({ name: newName.trim() }, { onSuccess: () => setNewName("") });
            }}
            style={{
              minHeight: 44,
              paddingHorizontal: theme.spacing.lg,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.accent,
            }}
          >
            <AppText style={{ color: theme.colors.text.onAccent }}>{t("tags.create")}</AppText>
          </Pressable>
        </View>

        {tagsQuery.data.length === 0 ? <AppText tone="muted">{t("tags.empty")}</AppText> : null}

        {tagsQuery.data.map((tag) => (
          <View
            key={tag.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.sm,
              borderBottomWidth: theme.border.width,
              borderBottomColor: theme.colors.border,
            }}
          >
            {editingId === tag.id ? (
              <>
                <TextInput
                  accessibilityLabel={t("tags.rename", { name: tag.name })}
                  value={editingName}
                  onChangeText={setEditingName}
                  autoFocus
                  style={{
                    flex: 1,
                    minHeight: 44,
                    paddingHorizontal: theme.spacing.sm,
                    borderWidth: theme.border.width,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.sm,
                    color: theme.colors.text.primary,
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("tags.save")}
                  onPress={() => {
                    updateTag.mutate(
                      { id: tag.id, patch: { name: editingName.trim() } },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          setEditingName("");
                        },
                      },
                    );
                  }}
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <AppText>{t("tags.save")}</AppText>
                </Pressable>
              </>
            ) : (
              <>
                <AppText style={{ flex: 1 }}>#{tag.name}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("tags.edit", { name: tag.name })}
                  onPress={() => {
                    setEditingId(tag.id);
                    setEditingName(tag.name);
                    setConfirmDeleteId(null);
                  }}
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <AppText tone="muted">{t("tags.editAction")}</AppText>
                </Pressable>
              </>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                confirmDeleteId === tag.id
                  ? t("tags.confirmDelete", { name: tag.name })
                  : t("tags.delete", { name: tag.name })
              }
              onPress={() => {
                if (confirmDeleteId !== tag.id) {
                  setConfirmDeleteId(tag.id);
                  return;
                }
                deleteTag.mutate(tag.id, { onSuccess: () => setConfirmDeleteId(null) });
              }}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <AppText tone="muted">
                {confirmDeleteId === tag.id ? t("tags.confirmAction") : t("tags.deleteAction")}
              </AppText>
            </Pressable>
          </View>
        ))}

        {message === null ? null : (
          <AppText accessibilityLiveRegion="polite" tone="muted" style={{ color: theme.colors.state.danger }}>
            {t(message)}
          </AppText>
        )}
      </ScrollView>
    </Screen>
  );
}
