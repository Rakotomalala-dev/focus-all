import { useLocalSearchParams } from "expo-router";
import { ProjectDetailScreen } from "../../src/features/projects";

export default function ProjectDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (typeof id !== "string" || id.length === 0) {
    return null;
  }

  return <ProjectDetailScreen projectId={id} />;
}
