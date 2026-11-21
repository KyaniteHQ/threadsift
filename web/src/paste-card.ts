import type { FetchResult } from "../../src/core/contract/fetch-results.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { whereOf } from "../../src/core/contract/link-place.ts";
import {
  CARD_TITLES,
  NOTICES,
  READING_NOTE,
  type NoteKey,
  type NoticeKey,
  failureTitleOf,
  waitTitle,
} from "./text.ts";
import { waitText } from "./wait-text.ts";

export type Shown = Readonly<{ seq: number; url: string }> &
  (
    | { readonly kind: "notice"; readonly key: NoticeKey }
    | { readonly kind: "item"; readonly itemId: number; readonly refreshed: boolean }
  );

export interface Face {
  readonly icon: "spin" | "check" | "refresh" | "warn";
  readonly tone: "tone-acc" | "tone-ok" | "tone-warn";
  readonly title: string;
  readonly name: string | null;
  readonly note: string | null;
  readonly wait: Item["wait"];
  readonly itemTitle: string | null;
  readonly alert: boolean;
  readonly closes: boolean;
  readonly actions: "open" | "retry" | "dismiss" | "none";
}

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

export function rejectsToken(item: Readonly<Item>): boolean {
  return item.status === "ready" && item.fetch === "github-token";
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

function savedLook(note: NoticeKey | null, refreshed: boolean) {
  if (note !== null) {
    return { icon: "warn", tone: "tone-warn" } as const;
  }

  return refreshed
    ? ({ icon: "refresh", tone: "tone-acc" } as const)
    : ({ icon: "check", tone: "tone-ok" } as const);
}

function savedFace(item: Readonly<Item>, refreshed: boolean): Face {
  const note = noteOf(item);

  return {
    ...savedLook(note, refreshed),
    title: CARD_TITLES[refreshed ? "refreshed" : "added"],
    name: item.title ?? whereOf(item),
    note: note === null ? null : NOTICES[note],
    wait: null,
    itemTitle: item.title,
    alert: false,
    closes: true,
    actions: "open",
  };
}

function readingFace(item: Readonly<Item>): Face {
  const { wait } = item;

  return {
    icon: "spin",
    tone: "tone-acc",
    title: wait === null ? CARD_TITLES.reading : waitTitle(wait),
    name: item.title ?? whereOf(item),
    note: wait === null ? READING_NOTE : waitText(wait, Date.now()),
    wait,
    itemTitle: null,
    alert: false,
    closes: false,
    actions: "none",
  };
}

function failedFace(item: Readonly<Extract<Item, { status: "failed" }>>): Face {
  return {
    icon: "warn",
    tone: "tone-warn",
    title: failureTitleOf(item),
    name: item.title ?? whereOf(item),
    note: null,
    wait: null,
    itemTitle: null,
    alert: true,
    closes: true,
    actions: "retry",
  };
}

function itemFace(item: Readonly<Item>, refreshed: boolean): Face {
  switch (item.status) {
    case "processing":
      return readingFace(item);
    case "failed":
      return failedFace(item);
    case "ready":
      return savedFace(item, refreshed);
    default: {
      const exhaustive: never = item;

      return exhaustive;
    }
  }
}

export function faceOf(shown: Readonly<Shown>, items: readonly Item[]): Face | null {
  if (shown.kind === "notice") {
    return {
      icon: "warn",
      tone: "tone-warn",
      title: NOTICES[shown.key],
      name: null,
      note: null,
      wait: null,
      itemTitle: null,
      alert: true,
      closes: false,
      actions: "dismiss",
    };
  }

  const item = items.find((each) => each.id === shown.itemId);

  return item === undefined ? null : itemFace(item, shown.refreshed);
}

export function announcementsOf(face: Readonly<Face> | null) {
  if (face === null) {
    return { polite: "", alert: "" };
  }

  const said = [face.name === null ? face.title : `${face.title}: ${face.name}`, face.note]
    .filter(Boolean)
    .join(". ");

  return face.alert ? { polite: "", alert: said } : { polite: said, alert: "" };
}
