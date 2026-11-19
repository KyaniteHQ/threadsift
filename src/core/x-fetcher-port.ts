import type { FetchFailure } from "./fetch-results.ts";
import type { XFetcherState, XReadNote } from "./kinds.ts";
import type { XCliThreadValue } from "./x-wire.ts";

export interface XFetcherStatus {
  readonly state: XFetcherState;
  readonly version: string | null;
}

export type XFetchFailure = Extract<FetchFailure, "unreadable" | "timeout" | "network" | "status">;

export interface UnreadableResult {
  readonly status: XFetchFailure;
  readonly note: XReadNote;
}

export type XFetch =
  | { readonly kind: "thread"; readonly thread: XCliThreadValue }
  | { readonly kind: "unanswered"; readonly ends: UnreadableResult }
  | { readonly kind: "failed"; readonly status: XFetchFailure; readonly note?: XReadNote };

export type XRefusalCategory =
  | "signed-out"
  | "usage-limit"
  | "unreachable"
  | "deadline"
  | "cli-error"
  | "no-answer"
  | "over-size"
  | "spawn-failed"
  | "surface-unproven"
  | "answer-refused"
  | "fewer-replies"
  | "internal";

export const NOTE_OF_REFUSAL = {
  "signed-out": "cli-signed-out",
  "usage-limit": "cli-usage-limit",
  unreachable: "cli-unreachable",
  deadline: null,
  "cli-error": "cli-failed",
  "no-answer": "cli-failed",
  "over-size": "cli-failed",
  "spawn-failed": "cli-not-installed",
  "surface-unproven": "cli-not-proven",
  "answer-refused": "x-answer-refused",
  "fewer-replies": "x-fewer-replies",
  internal: "cli-failed",
} as const satisfies Readonly<Record<XRefusalCategory, XReadNote | null>>;

export interface XFetcher {
  readonly id: "grok-cli";
  readonly fetch: (statusId: string, signal: AbortSignal) => Promise<XFetch>;
  readonly status: () => Promise<XFetcherStatus>;
}
