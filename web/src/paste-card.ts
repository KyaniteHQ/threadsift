import type { FetchResult } from "../../src/core/fetch-results.ts";
import type { FailureReason } from "../../src/core/kinds.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { NoteKey, NoticeKey } from "./text.ts";

export type CardView =
  | { readonly kind: "reading" }
  | { readonly kind: "added" | "refreshed"; readonly note: NoticeKey | null }
  | { readonly kind: "failed"; readonly reason: FailureReason };

const NOTE_OF_RESULT: Readonly<Record<FetchResult, NoteKey | null>> = {
  ok: null,
  "not-requested": null,
  timeout: null,
  network: null,
  refused: "refused",
  unsupported: "unsupported",
  "redirect-limit": "redirect-limit",
  "redirect-stopped": "redirect-stopped",
  status: "status",
  "no-title": "no-title",
  unreadable: "unreadable",
};

export function failureReasonOf(item: Readonly<Item>): FailureReason {
  return item.reason ?? "gave-up";
}

function noteOf(item: Readonly<Item>, refreshed: boolean): NoticeKey | null {
  if (item.fetch === null || item.fetch === "ok") {
    return null;
  }

  return refreshed && item.title !== null ? "title-kept" : NOTE_OF_RESULT[item.fetch];
}

export function viewOf(item: Readonly<Item>, refreshed: boolean): CardView {
  if (item.status === "processing") {
    return { kind: "reading" };
  }

  if (item.status === "failed") {
    return { kind: "failed", reason: failureReasonOf(item) };
  }

  return { kind: refreshed ? "refreshed" : "added", note: noteOf(item, refreshed) };
}
