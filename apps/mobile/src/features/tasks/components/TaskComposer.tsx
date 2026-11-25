import { MAX_TASK_TITLE_LENGTH, taskTitleSchema } from "@focus/contracts";
import { AppText, useFocusTheme } from "@focus/ui";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Pressable, TextInput, View } from "react-native";

export type TaskComposerProps = {
  readonly onCreate: (input: string) => Promise<void>;
  readonly isSubmitting: boolean;
};

type ComposerForm = {
  readonly text: string;
};

type ValidationKey = "tasks.composer.missingTitle" | "tasks.composer.titleTooLong";

export function TaskComposer({ onCreate, isSubmitting }: TaskComposerProps) {
  const theme = useFocusTheme();
  const { t } = useTranslation();
  const [validationKey, setValidationKey] = useState<ValidationKey | null>(null);
  const { control, handleSubmit, reset } = useForm<ComposerForm>({
    defaultValues: { text: "" },
  });

  // La validation réutilise le schéma du contrat (aucun schéma local) ; le titre
  // syntaxique est ensuite extrait par `parseQuickTask`.
  const submit = handleSubmit(async ({ text }) => {
    if (!taskTitleSchema.safeParse(text).success) {
      setValidationKey(
        text.trim().length === 0 ? "tasks.composer.missingTitle" : "tasks.composer.titleTooLong",
      );
      return;
    }

    setValidationKey(null);
    try {
      await onCreate(text);
      reset();
    } catch {
      // L'échec est rendu par l'écran via l'erreur de mutation ; le texte reste
      // en place pour que l'utilisateur puisse réessayer sans le ressaisir.
    }
  });

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
        <Controller
          control={control}
          name="text"
          render={({ field: { onBlur, onChange, value } }) => (
            <TextInput
              accessibilityLabel={t("tasks.composer.label")}
              placeholder={t("tasks.composer.placeholder")}
              placeholderTextColor={theme.colors.text.muted}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              editable={!isSubmitting}
              maxLength={MAX_TASK_TITLE_LENGTH}
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
          )}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tasks.composer.submit")}
          disabled={isSubmitting}
          onPress={() => {
            void submit();
          }}
          style={{
            minHeight: 44,
            minWidth: 44,
            paddingHorizontal: theme.spacing.lg,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.accent,
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          <AppText style={{ color: theme.colors.text.onAccent, fontWeight: "600" }}>
            {t("tasks.composer.submit")}
          </AppText>
        </Pressable>
      </View>

      {validationKey === null ? null : (
        <AppText
          accessibilityLiveRegion="polite"
          tone="muted"
          style={{ color: theme.colors.state.danger }}
        >
          {t(validationKey)}
        </AppText>
      )}
    </View>
  );
}
