import type { DigestOutcome, FailureReason, ItemStatus } from "./kinds.ts";

export type ShownStatus =
  | { readonly status: "failed"; readonly reason: FailureReason; readonly retry: "paste" }
  | { readonly status: "processing"; readonly reason: null; readonly retry: null }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: "digest" | "paste" | null;
    };

export interface ShownStatusInput {
  readonly status: ItemStatus;
  readonly reason: FailureReason | null;
  readonly digestOutcome: DigestOutcome;
  readonly digestSource: boolean;
}

export function shownStatus({
  status,
  reason,
  digestOutcome,
  digestSource,
}: Readonly<ShownStatusInput>): ShownStatus {
  if (status === "failed") {
    if (reason === null) throw new Error("A failed status comes with its reason");

    return { status, reason, retry: "paste" };
  }

  if (status === "processing") return { status, reason: null, retry: null };

  if (digestOutcome !== "failed") return { status, reason: null, retry: null };

  return { status, reason: null, retry: digestSource ? "digest" : "paste" };
}
