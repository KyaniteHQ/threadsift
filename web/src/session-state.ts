import type { Session } from "./access-api.ts";

export type View = Session | { readonly state: "loading" } | { readonly state: "unreachable" };

export type SessionFlow =
  | { readonly kind: "settled"; readonly view: View }
  | { readonly kind: "checking"; readonly check: Readonly<AbortController>; readonly view: View };

export type SessionEvent =
  | { readonly kind: "check"; readonly check: Readonly<AbortController> }
  | { readonly kind: "answer"; readonly check: Readonly<AbortController>; readonly view: View }
  | { readonly kind: "signed-in" }
  | { readonly kind: "signed-out" };

const LOADING: View = { state: "loading" };
export const UNREACHABLE: View = { state: "unreachable" };

const SIGNED_IN: View = { state: "signed-in" };
const SIGNED_OUT: View = { state: "signed-out" };

export function startSession(): SessionFlow {
  return { kind: "settled", view: LOADING };
}

export function reduceSession(flow: SessionFlow, event: SessionEvent): SessionFlow {
  switch (event.kind) {
    case "check":
      return { kind: "checking", check: event.check, view: flow.view };
    case "answer":
      return flow.kind === "checking" && flow.check === event.check
        ? { kind: "settled", view: event.view }
        : flow;
    case "signed-in":
      return { kind: "settled", view: SIGNED_IN };
    case "signed-out":
      return { kind: "settled", view: SIGNED_OUT };
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
