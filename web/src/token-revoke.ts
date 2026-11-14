type RevokeFlow =
  | { readonly kind: "idle"; readonly focus: number | null }
  | { readonly kind: "asking"; readonly id: number }
  | { readonly kind: "revoking"; readonly id: number; readonly request: number }
  | { readonly kind: "failed"; readonly id: number };

type RevokeEvent =
  | { readonly kind: "ask"; readonly id: number }
  | { readonly kind: "cancel"; readonly id: number }
  | { readonly kind: "begin"; readonly id: number; readonly request: number }
  | { readonly kind: "refuse"; readonly id: number; readonly request: number }
  | { readonly kind: "revoked"; readonly id: number; readonly next: number | null };

export const START: RevokeFlow = { kind: "idle", focus: null };

export function askedId(flow: Readonly<RevokeFlow>): number | null {
  return flow.kind === "idle" ? null : flow.id;
}

function isRevoking(flow: Readonly<RevokeFlow>, id: number, request: number): boolean {
  return flow.kind === "revoking" && flow.id === id && flow.request === request;
}

export function reduceRevoke(flow: RevokeFlow, event: RevokeEvent): RevokeFlow {
  switch (event.kind) {
    case "ask":
      return { kind: "asking", id: event.id };
    case "cancel":
      return { kind: "idle", focus: event.id };
    case "begin":
      return (flow.kind === "asking" || flow.kind === "failed") && flow.id === event.id
        ? { kind: "revoking", id: event.id, request: event.request }
        : flow;
    case "refuse":
      return isRevoking(flow, event.id, event.request) ? { kind: "failed", id: event.id } : flow;
    case "revoked":
      return flow.kind !== "idle" && flow.id === event.id
        ? { kind: "idle", focus: event.next }
        : flow;
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
