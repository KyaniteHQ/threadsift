export type DeleteFlow =
  | { readonly kind: "closed" }
  | { readonly kind: "asking" }
  | { readonly kind: "pending"; readonly attempt: number }
  | { readonly kind: "failed" };

export type DeleteEvent =
  | { readonly kind: "ask" }
  | { readonly kind: "cancel" }
  | { readonly kind: "confirm"; readonly attempt: number }
  | { readonly kind: "refuse"; readonly attempt: number }
  | { readonly kind: "time-out" }
  | { readonly kind: "delete" };

export const CLOSED: DeleteFlow = { kind: "closed" };

export function reduceDelete(flow: DeleteFlow, event: DeleteEvent): DeleteFlow {
  switch (event.kind) {
    case "ask":
      return flow.kind === "closed" ? { kind: "asking" } : flow;
    case "cancel":
      return flow.kind === "asking" || flow.kind === "failed" ? CLOSED : flow;
    case "confirm":
      return flow.kind === "asking" || flow.kind === "failed"
        ? { kind: "pending", attempt: event.attempt }
        : flow;
    case "refuse":
      return flow.kind === "pending" && flow.attempt === event.attempt ? { kind: "failed" } : flow;
    case "time-out":
      return flow.kind === "pending" ? { kind: "failed" } : flow;
    case "delete":
      return CLOSED;
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
