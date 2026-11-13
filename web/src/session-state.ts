import type { Session } from "./access-api.ts";

export type View = Session | { readonly state: "loading" } | { readonly state: "unreachable" };

type SessionFlow =
  | { readonly kind: "settled"; readonly view: View }
  | { readonly kind: "checking"; readonly check: Readonly<AbortController>; readonly view: View };

export type SessionEvent =
  | { readonly kind: "check"; readonly check: Readonly<AbortController> }
  | { readonly kind: "answer"; readonly check: Readonly<AbortController>; readonly view: View }
  | { readonly kind: "unauthorized"; readonly check: Readonly<AbortController> }
  | { readonly kind: "logged-out"; readonly check: Readonly<AbortController> }
  | { readonly kind: "signed-in" };

const LOADING: View = { state: "loading" };
export const UNREACHABLE: View = { state: "unreachable" };

const SIGNED_IN: View = { state: "signed-in" };

function answeredView(shown: View, answered: View): View {
  return shown.state === "signed-in" && answered.state === "unreachable" ? shown : answered;
}

export function startSession(): SessionFlow {
  return { kind: "settled", view: LOADING };
}

export function reduceSession(flow: SessionFlow, event: SessionEvent): SessionFlow {
  switch (event.kind) {
    case "check":
      return { kind: "checking", check: event.check, view: flow.view };
    case "unauthorized":
      return flow.kind === "settled" && flow.view.state === "signed-in"
        ? { kind: "checking", check: event.check, view: flow.view }
        : flow;
    case "logged-out":
      return { kind: "checking", check: event.check, view: LOADING };
    case "answer":
      return flow.kind === "checking" && flow.check === event.check
        ? { kind: "settled", view: answeredView(flow.view, event.view) }
        : flow;
    case "signed-in":
      return { kind: "settled", view: SIGNED_IN };
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
