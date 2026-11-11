import type { SetupCodeProblem } from "../../src/core/setup-code.ts";
import { topicKeyOf } from "../../src/core/topic-path.ts";
import { HIGHLIGHTS_PATH, RESET_PATH, SETTINGS_PATH } from "./routing.ts";
import type { View } from "./use-session-view.ts";

const TITLES = {
  setup: "Set up Threadsift",
  login: "Sign in to Threadsift",
  reset: "Reset password, Threadsift",
  settings: "Settings, Threadsift",
  highlights: "Highlights, Threadsift",
  topic: "Topic, Threadsift",
  library: "Threadsift",
  loading: "Threadsift",
  unreachable: "Threadsift",
} as const;

type Named<Name extends string> = { readonly name: Name };

export type ScreenState =
  | Named<"loading">
  | Named<"unreachable">
  | Named<"login">
  | Named<"reset">
  | Named<"settings">
  | Named<"highlights">
  | Named<"library">
  | { readonly name: "setup"; readonly problem: SetupCodeProblem | null }
  | { readonly name: "topic"; readonly key: string };

export type ScreenName = ScreenState["name"];

export type SignedInState = Extract<
  ScreenState,
  { readonly name: "settings" | "highlights" | "library" | "topic" }
>;

export function isSignedInScreen(screen: Readonly<ScreenState>): screen is SignedInState {
  return (
    screen.name === "settings" ||
    screen.name === "highlights" ||
    screen.name === "library" ||
    screen.name === "topic"
  );
}

function signedInScreen(path: string): ScreenState {
  if (path === SETTINGS_PATH) return { name: "settings" };

  if (path === HIGHLIGHTS_PATH) return { name: "highlights" };

  const key = topicKeyOf(path);

  return key === null ? { name: "library" } : { name: "topic", key };
}

export function screenOf(view: View, path: string): ScreenState {
  switch (view.state) {
    case "setup":
      return { name: "setup", problem: view.code === "set" ? null : view.code };
    case "signed-out":
      return { name: path === RESET_PATH ? "reset" : "login" };
    case "signed-in":
      return signedInScreen(path);
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
