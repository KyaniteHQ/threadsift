import {
  type DigestOutcome,
  type FailureReason,
  type ItemStatus,
  type XFetchRetryNote,
  type XReadNote,
  isXFetchRetryNote,
} from "./kinds.ts";

export type ShownStatus =
  | {
      readonly status: "failed";
      readonly reason: FailureReason;
      readonly retry: "paste";
      readonly digestOutcome: DigestOutcome;
    }
  | {
      readonly status: "processing";
      readonly reason: null;
      readonly retry: null;
      readonly digestOutcome: DigestOutcome;
    }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: "digest" | "paste";
      readonly digestOutcome: "failed";
    }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: "paste";
      readonly xNote: XFetchRetryNote;
      readonly digestOutcome: "none";
    }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: null;
      readonly digestOutcome: "none";
    };

export interface ShownStatusInput {
  readonly status: ItemStatus;
  readonly reason: FailureReason | null;
  readonly digestOutcome: DigestOutcome;
  readonly xNote: XReadNote | null;
  readonly digestSource: boolean;
}

export function shownStatus({
  status,
  reason,
  digestOutcome,
  digestSource,
  xNote,
}: Readonly<ShownStatusInput>): ShownStatus {
  if (status === "failed") {
    if (reason === null) throw new Error("A failed status comes with its reason");

    return { status, reason, digestOutcome, retry: "paste" };
  }

  if (status === "processing") return { status, reason: null, digestOutcome, retry: null };

  if (digestOutcome !== "failed") {
    if (!digestSource && isXFetchRetryNote(xNote))
      return { status, reason: null, retry: "paste", xNote, digestOutcome: "none" };
    return { status, reason: null, retry: null, digestOutcome: "none" };
  }

  return { status, reason: null, digestOutcome, retry: digestSource ? "digest" : "paste" };
}
