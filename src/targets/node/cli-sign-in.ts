import type { ProcessEnd } from "./cli-process.ts";

export type SignIn = "signed-in" | "signed-out" | "unknown";

export type ExitedEnd = Extract<ProcessEnd, { readonly kind: "exited" }>;

export function signInFrom(end: Readonly<ProcessEnd>, read: (exited: ExitedEnd) => SignIn): SignIn {
  return end.kind === "exited" && end.code !== null ? read(end) : "unknown";
}
