import { Redirect } from "expo-router";
import { useSession } from "../src/features/auth";
import { TagsScreen } from "../src/features/tags";

export default function TagsRoute() {
  const { status } = useSession();
  if (status === "signedOut") {
    return <Redirect href="/login" />;
  }
  return <TagsScreen />;
}
