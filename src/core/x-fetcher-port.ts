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

export interface XFetcher {
  readonly id: "grok-cli";
  readonly fetch: (statusId: string, signal: AbortSignal) => Promise<XFetch>;
  readonly status: () => Promise<XFetcherStatus>;
}
