import type { FetchResult } from "../../src/core/fetch-results.ts";
import type { Item } from "../../src/http/schemas.ts";
import { type NoteKey, type NoticeKey, failureTitleOf } from "./text.ts";

export type CardView =
  | { readonly kind: "reading"; readonly wait: Item["wait"] }
  | { readonly kind: "added" | "refreshed"; readonly note: NoticeKey | null }
  | { readonly kind: "failed"; readonly title: string };

const NOTE_OF_RESULT: Readonly<Record<FetchResult, NoteKey | null>> = {
  ok: null,
  "not-requested": null,
  timeout: null,
  network: null,
  refused: "refused",
  unsupported: "unsupported",
  "redirect-limit": "redirect-limit",
  "redirect-stopped": "redirect-stopped",
  unresolved: "unresolved",
  status: "status",
  "no-title": "no-title",
  unreadable: "unreadable",
  "github-token": "github-token",
};

export function offersFetchRetry(
  item: Readonly<Item>,
): item is Item & { retry: "paste"; xNote: "x-unconfirmed"; status: "ready" } {
  return item.status === "ready" && item.retry === "paste" && item.xNote === "x-unconfirmed";
}

export function noteOf(item: Readonly<Item>): NoticeKey | null {
  if (item.status === "processing") {
    return null;
  }

  if (item.xNote !== null) {
    return item.xNote;
  }

  if (item.fetch === null || item.fetch === "ok") {
    return null;
  }

  if (item.fetch === "github-token") {
    return "github-token";
  }

  if (item.source === "x" && item.fetch === "unreadable") {
    return item.title === null ? "x-unreadable" : "x-kept";
  }

  return item.title === null ? NOTE_OF_RESULT[item.fetch] : "title-kept";
}

export function viewOf(item: Readonly<Item>, refreshed: boolean): CardView {
  if (item.status === "processing") {
    return { kind: "reading", wait: item.wait };
  }

  if (item.status === "failed") {
    return { kind: "failed", title: failureTitleOf(item) };
  }

  return { kind: refreshed ? "refreshed" : "added", note: noteOf(item) };
}
