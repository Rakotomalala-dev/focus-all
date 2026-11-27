import { Redirect } from "expo-router";
import { useSession } from "../src/features/auth";
import { TrashScreen } from "../src/features/trash";

export default function TrashRoute() {
  const { status } = useSession();
  if (status === "signedOut") {
    return <Redirect href="/login" />;
  }
  return <TrashScreen />;
}
