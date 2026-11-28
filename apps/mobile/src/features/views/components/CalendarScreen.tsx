import type { CalendarMode, ViewCard } from "@focus/contracts";
import { AppText, Screen, useFocusTheme } from "@focus/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useCalendar } from "../api/use-views";
import { formatDuration } from "../utils/format-duration";
import { dayOfMonth, formatDay } from "../utils/format-day";
import { ViewError, ViewLoading } from "./ViewStates";

const WEEK_LENGTH = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftMonth(anchor: string, delta: number): string {
  const date = new Date(`${anchor}T00:00:00.000Z`);
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
  return shifted.toISOString().slice(0, 10);
}

function shiftDays(anchor: string, delta: number): string {
  return new Date(new Date(`${anchor}T00:00:00.000Z`).getTime() + delta * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function leadingBlanks(from: string): number {
  const weekday = new Date(`${from}T00:00:00.000Z`).getUTCDay();
  return (weekday + 6) % 7;
}

// RF-33 : lecture seule au MVP. Mois = grille avec compteurs par jour ;
// semaine = colonnes par jour, l'heure triée quand elle existe. Les
// occurrences récurrentes viennent déjà calculées par le serveur.
export function CalendarScreen() {
  const theme = useFocusTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [mode, setMode] = useState<CalendarMode>("MONTH");
  const [anchor, setAnchor] = useState(todayIso);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const calendarQuery = useCalendar({ mode, anchor });

  const data = calendarQuery.status === "success" ? calendarQuery.data : undefined;
  const selected = selectedDate ?? data?.from ?? todayIso();
  const selectedDay = data?.days.find((day) => day.date === selected);
  const totalTasks = data?.days.reduce((sum, day) => sum + day.count, 0) ?? 0;

  function openTask(card: ViewCard): void {
    router.push({ pathname: "/tasks/[id]", params: { id: card.task.id } });
  }

  function renderHeader() {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <AppText tone="display">{t("views.calendar.title")}</AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, flexWrap: "wrap" }}>
          <NavButton
            label={t("views.calendar.previous")}
            onPress={() =>
              setAnchor(mode === "MONTH" ? shiftMonth(anchor, -1) : shiftDays(anchor, -WEEK_LENGTH))
            }
          />
          <NavButton
            label={t("views.calendar.next")}
            onPress={() =>
              setAnchor(mode === "MONTH" ? shiftMonth(anchor, 1) : shiftDays(anchor, WEEK_LENGTH))
            }
          />
          <NavButton
            label={t("views.calendar.today")}
            onPress={() => {
              setAnchor(todayIso());
              setSelectedDate(todayIso());
            }}
          />
        </View>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {(["MONTH", "WEEK"] as const).map((value) => (
            <NavButton
              key={value}
              label={t(`views.calendar.modes.${value}`)}
              selected={mode === value}
              onPress={() => setMode(value)}
            />
          ))}
        </View>
        <AppText tone="muted">
          {data === undefined
            ? t(`views.calendar.modes.${mode}`)
            : `${formatDay(data.from, i18n.language, { day: "numeric", month: "long", year: "numeric" })} – ${formatDay(data.to, i18n.language, { day: "numeric", month: "long", year: "numeric" })}`}
        </AppText>
        <AppText tone="muted">
          {t("views.calendar.periodLoad", {
            count: totalTasks,
            duration: formatDuration(
              data?.days.reduce((sum, day) => sum + day.estimateMinutes, 0) ?? 0,
            ),
          })}
        </AppText>
      </View>
    );
  }

  function renderMonthGrid() {
    if (data === undefined) return null;
    const blanks = leadingBlanks(data.from);
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: blanks }, (_, index) => (
          <View key={`blank-${index}`} style={{ width: "14.2857%", height: 56 }} />
        ))}
        {data.days.map((day) => {
          const isSelected = day.date === selected;
          return (
            <View key={day.date} style={{ width: "14.2857%", padding: 2 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={t("views.calendar.dayLabel", {
                  date: formatDay(day.date, i18n.language),
                  count: day.count,
                })}
                onPress={() => setSelectedDate(day.date)}
                style={{
                  minHeight: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: theme.radii.sm,
                  borderWidth: theme.border.width,
                  borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: isSelected ? theme.colors.bg.surface : undefined,
                  gap: 2,
                }}
              >
                <AppText tone="muted">{dayOfMonth(day.date)}</AppText>
                {day.count === 0 ? (
                  <View style={{ height: 14 }} />
                ) : (
                  <AppText tone="muted">{t("views.calendar.dot", { count: day.count })}</AppText>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  }

  function renderWeekColumns() {
    if (data === undefined) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {data.days.map((day) => (
            <View
              key={day.date}
              style={{
                width: 200,
                gap: theme.spacing.xs,
                padding: theme.spacing.sm,
                borderWidth: theme.border.width,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
              }}
            >
              <AppText tone="title">{formatDay(day.date, i18n.language, { weekday: "short", day: "numeric" })}</AppText>
              <AppText tone="muted">{t("views.calendar.dayMeta", { count: day.count, duration: formatDuration(day.estimateMinutes) })}</AppText>
              {day.tasks.length === 0 ? (
                <AppText tone="muted">{t("views.calendar.emptyDay")}</AppText>
              ) : (
                day.tasks.map((card) => (
                  <Pressable
                    key={`${card.task.id}:${card.occurrenceDate ?? day.date}`}
                    accessibilityRole="button"
                    accessibilityLabel={t("views.calendar.open", { title: card.task.title })}
                    onPress={() => openTask(card)}
                    style={{ minHeight: 44, justifyContent: "center", gap: 2 }}
                  >
                    {card.task.dueTime === undefined ? null : (
                      <AppText tone="muted">{card.task.dueTime}</AppText>
                    )}
                    <AppText>{card.task.title}</AppText>
                    {card.projectName === null ? null : (
                      <AppText tone="muted">{card.projectName}</AppText>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderSelection() {
    if (data === undefined) return null;
    return (
      <View style={{ gap: theme.spacing.xs }}>
        <AppText tone="title">{formatDay(selected, i18n.language, { weekday: "long", day: "numeric", month: "long" })}</AppText>
        {selectedDay === undefined || selectedDay.tasks.length === 0 ? (
          <AppText tone="muted">{t("views.calendar.emptyDay")}</AppText>
        ) : (
          selectedDay.tasks.map((card) => (
            <Pressable
              key={`${card.task.id}:${card.occurrenceDate ?? selected}`}
              accessibilityRole="button"
              accessibilityLabel={t("views.calendar.open", { title: card.task.title })}
              onPress={() => openTask(card)}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingVertical: theme.spacing.xs,
                borderBottomWidth: theme.border.width,
                borderBottomColor: theme.colors.border,
                gap: 2,
              }}
            >
              <AppText>{card.task.title}</AppText>
              <AppText tone="muted">
                {[
                  card.task.dueTime,
                  card.projectName,
                  t(`tasks.priority.${card.task.priority}`),
                ]
                  .filter((part): part is string => part !== undefined && part !== null)
                  .join(" · ")}
              </AppText>
            </Pressable>
          ))
        )}
      </View>
    );
  }

  function renderBody() {
    if (calendarQuery.status === "pending") {
      return <ViewLoading messageKey="views.calendar.loading" />;
    }
    if (calendarQuery.status === "error") {
      return (
        <ViewError
          titleKey="views.calendar.error.title"
          error={calendarQuery.error}
          onRetry={() => {
            void calendarQuery.refetch();
          }}
        />
      );
    }

    return (
      <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        {mode === "MONTH" ? renderMonthGrid() : renderWeekColumns()}
        {totalTasks === 0 ? (
          <AppText tone="muted">{t("views.calendar.emptyPeriod")}</AppText>
        ) : null}
        {mode === "MONTH" ? renderSelection() : null}
      </ScrollView>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.md }}>
        {renderHeader()}
        {renderBody()}
      </View>
    </Screen>
  );
}

function NavButton({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
}) {
  const theme = useFocusTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: selected === true }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: theme.spacing.md,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radii.md,
        borderWidth: theme.border.width,
        borderColor: selected === true ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected === true ? theme.colors.accent : undefined,
      }}
    >
      <AppText style={selected === true ? { color: theme.colors.text.onAccent } : undefined}>
        {label}
      </AppText>
    </Pressable>
  );
}
