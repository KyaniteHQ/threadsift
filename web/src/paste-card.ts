import type { FetchResult } from "../../src/core/contract/fetch-results.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { type NoteKey, type NoticeKey, failureTitleOf } from "./text.ts";

export type CardView =
  | { readonly kind: "reading"; readonly wait: Item["wait"] }
  | { readonly kind: "added" | "refreshed"; readonly note: NoticeKey | null }
  | { readonly kind: "failed"; readonly title: string };

function noteOfResult(result: FetchResult): NoteKey | null {
  switch (result) {
    case "ok":
    case "not-requested":
    case "timeout":
    case "network":
      return null;
    case "refused":
    case "unsupported":
    case "redirect-limit":
    case "redirect-stopped":
    case "unresolved":
    case "status":
    case "no-title":
    case "unreadable":
    case "github-token":
      return result;
    default: {
      const exhaustive: never = result;

      return exhaustive;
    }
  }
}

export function offersFetchRetry(item: Readonly<Item>) {
  return item.status === "ready" && item.retry === "paste" && item.digestOutcome === "none";
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

  if (item.title !== null) return "title-kept";

  return noteOfResult(item.fetch);
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
