import type { Task } from "@focus/contracts";
import { AppText, useFocusTheme } from "@focus/ui";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { formatDueDate } from "../utils/format-due-date";

export type TaskCardProps = {
  readonly task: Task;
  readonly onToggle: (task: Task) => void;
  readonly onOpen?: (task: Task) => void;
  readonly isPending: boolean;
};

export function TaskCard({ task, onToggle, onOpen, isPending }: TaskCardProps) {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const isDone = task.status === "DONE";
  const statusLabel = t(`tasks.status.${task.status}`);
  // La couleur ne porte jamais l'information seule : le statut et la priorité
  // restent écrits à côté de la case (doc 04 §11.3).
  const meta =
    task.priority === "NONE"
      ? t("tasks.card.meta", { status: statusLabel })
      : t("tasks.card.metaWithPriority", {
          status: statusLabel,
          priority: t(`tasks.priority.${task.priority}`),
        });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: theme.border.width,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone, disabled: isPending }}
        accessibilityLabel={
          isDone
            ? t("tasks.card.reopen", { title: task.title })
            : t("tasks.card.markDone", { title: task.title })
        }
        disabled={isPending}
        onPress={() => onToggle(task)}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: theme.radii.sm,
            borderWidth: 2,
            borderColor: isDone ? theme.colors.state.success : theme.colors.text.muted,
            backgroundColor: isDone ? theme.colors.state.success : "transparent",
          }}
        />
      </Pressable>

      <Pressable
        accessibilityRole={onOpen === undefined ? undefined : "button"}
        accessibilityLabel={onOpen === undefined ? undefined : t("tasks.card.open", { title: task.title })}
        onPress={onOpen === undefined ? undefined : () => onOpen(task)}
        style={{ flex: 1, gap: theme.spacing.xs, minHeight: 44, justifyContent: "center" }}
      >
        <AppText
          style={
            isDone
              ? { textDecorationLine: "line-through", color: theme.colors.text.muted }
              : undefined
          }
        >
          {task.title}
        </AppText>
        <AppText tone="muted">{meta}</AppText>
        {task.dueDate === undefined ? null : (
          <AppText tone="muted">
            {t("tasks.dueDate", { date: formatDueDate(task.dueDate, i18n.language) })}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
