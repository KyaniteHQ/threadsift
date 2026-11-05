import type { SetupCodeProblem } from "../../src/core/setup-code.ts";
import { TITLES } from "./access-text.ts";
import { SETTINGS_PATH } from "./session.ts";
import type { View } from "./use-session-view.ts";

export type ScreenState =
  | { readonly name: "loading" | "unreachable" | "login" | "settings" | "library" }
  | { readonly name: "setup"; readonly problem: SetupCodeProblem | null };

export type ScreenName = ScreenState["name"];

export function screenOf(view: View, path: string): ScreenState {
  switch (view.state) {
    case "setup":
      return { name: "setup", problem: view.code === "set" ? null : view.code };
    case "signed-out":
      return { name: "login" };
    case "signed-in":
      return { name: path === SETTINGS_PATH ? "settings" : "library" };
    case "loading":
    case "unreachable":
      return { name: view.state };
    default:
      return view satisfies never;
  }
}

export function titleOf(screen: ScreenState): string {
  return TITLES[screen.name];
}
