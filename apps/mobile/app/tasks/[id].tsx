import { useLocalSearchParams } from "expo-router";
import { TaskDetailScreen } from "../../src/features/tasks";

// Route = transport : l'identifiant vient de l'URL, l'écran reste testable seul.
export default function TaskDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (typeof id !== "string" || id.length === 0) {
    return null;
  }

  return <TaskDetailScreen taskId={id} />;
}
