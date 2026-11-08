import type { FetchResult } from "../../src/core/fetch-results.ts";
import type { FailureReason } from "../../src/core/kinds.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { NoteKey, NoticeKey } from "./text.ts";

export type CardView =
  | { readonly kind: "reading"; readonly wait: Item["wait"] }
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
  "github-token": "github-token",
};

export function noteOf(item: Readonly<Item>): NoticeKey | null {
  if (item.fetch === null || item.fetch === "ok") {
    return null;
  }

  if (item.fetch === "github-token") {
    return "github-token";
  }

  return item.title === null ? NOTE_OF_RESULT[item.fetch] : "title-kept";
}

export function viewOf(item: Readonly<Item>, refreshed: boolean): CardView {
  if (item.status === "processing") {
    return { kind: "reading", wait: item.wait };
  }

  if (item.status === "failed") {
    return { kind: "failed", reason: item.reason };
  }

  return { kind: refreshed ? "refreshed" : "added", note: noteOf(item) };
}
