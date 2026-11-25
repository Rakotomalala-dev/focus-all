import type { Theme } from "@focus/design-tokens";
import { Text, type TextProps, type TextStyle } from "react-native";
import { useFocusTheme } from "./use-focus-theme";

// Quatre tons, pas plus : la hiérarchie prime sur la décoration (UX-1) et un
// écran ne doit pas empiler des styles ad hoc.
export type TextTone = "display" | "title" | "body" | "muted";

export type AppTextProps = TextProps & { readonly tone?: TextTone };

function styleForTone(tone: TextTone, theme: Theme): TextStyle {
  switch (tone) {
    case "display":
    case "title": {
      const scale = tone === "display" ? theme.typography.display : theme.typography.lg;
      return {
        fontSize: scale.size,
        lineHeight: scale.lineHeight,
        fontFamily: theme.fontFamilies.display,
        fontWeight: "600",
        color: theme.colors.text.primary,
      };
    }
    case "body":
      return {
        fontSize: theme.typography.md.size,
        lineHeight: theme.typography.md.lineHeight,
        fontFamily: theme.fontFamilies.text,
        color: theme.colors.text.primary,
      };
    case "muted":
      return {
        fontSize: theme.typography.sm.size,
        lineHeight: theme.typography.sm.lineHeight,
        fontFamily: theme.fontFamilies.text,
        color: theme.colors.text.muted,
      };
  }
}

export function AppText({ tone = "body", style, ...rest }: AppTextProps) {
  const theme = useFocusTheme();

  return <Text {...rest} style={[styleForTone(tone, theme), style]} />;
}
