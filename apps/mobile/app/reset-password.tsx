import { useLocalSearchParams } from "expo-router";
import { ResetPasswordScreen } from "../src/features/auth";

export default function ResetPasswordRoute() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return <ResetPasswordScreen token={token} />;
}
