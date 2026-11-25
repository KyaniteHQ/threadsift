import type { SignIn } from "./cli-sign-in.ts";

const LINES: ReadonlyMap<string, SignIn> = new Map([
  ["You are logged in with grok.com.", "signed-in"],
  ["You are not authenticated.", "signed-out"],
]);

export function signInOf(output: string): SignIn {
  const [first = ""] = output.split(/\r\n|\n/u);

  return LINES.get(first.trim()) ?? "unknown";
}
