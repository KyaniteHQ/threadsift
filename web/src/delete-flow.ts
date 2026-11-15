export type DeleteFlow =
  | { readonly kind: "closed" }
  | { readonly kind: "asking" }
  | { readonly kind: "pending" }
  | { readonly kind: "failed" };

export type DeleteEvent =
  | { readonly kind: "ask" }
  | { readonly kind: "cancel" }
  | { readonly kind: "confirm" }
  | { readonly kind: "refuse" }
  | { readonly kind: "delete" };

export const CLOSED: DeleteFlow = { kind: "closed" };

export function reduceDelete(flow: DeleteFlow, event: DeleteEvent): DeleteFlow {
  switch (event.kind) {
    case "ask":
      return flow.kind === "closed" ? { kind: "asking" } : flow;
    case "cancel":
      return flow.kind === "asking" || flow.kind === "failed" ? CLOSED : flow;
    case "confirm":
      return flow.kind === "asking" || flow.kind === "failed" ? { kind: "pending" } : flow;
    case "refuse":
      return flow.kind === "pending" ? { kind: "failed" } : flow;
    case "delete":
      return CLOSED;
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
