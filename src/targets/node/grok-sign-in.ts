export type SignInLine = "signed-in" | "signed-out" | "unknown";

const LINES: ReadonlyMap<string, SignInLine> = new Map([
  ["You are logged in with grok.com.", "signed-in"],
  ["You are not authenticated.", "signed-out"],
]);

export function signInOf(output: string): SignInLine {
  const [first = ""] = output.split(/\r\n|\n/u);

  return LINES.get(first.trim()) ?? "unknown";
}
