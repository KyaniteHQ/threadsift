import type { FetchFailure } from "../contract/fetch-results.ts";
import type { XReadNote } from "../contract/x-read-note.ts";
import type { RefusedUpdate, XFetcherState } from "../contract/x-settings-contract.ts";
import type { XCliThreadValue } from "../contract/x-wire.ts";

export interface XFetcherStatus {
  readonly state: XFetcherState;
  readonly version: string | null;
  readonly refusedUpdate: RefusedUpdate | null;
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
