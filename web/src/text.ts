import type { FetchFailure } from "../../src/core/fetch-results.ts";
import type { FailureReason, Source } from "../../src/core/kinds.ts";

export function filled(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

export const PASTE_LABEL = "Paste a link to save";
export const PASTE_PLACEHOLDER = "Paste a link";
export const ADD_LABEL = "Add";
export const SAVING_LABEL = "Saving…";
export const SAVING_STATUS = "Saving link and fetching page title…";

export type NoteKey = Exclude<FetchFailure, "timeout" | "network">;

export type NoticeKey = NoteKey | "empty" | "invalid" | "failed" | "title-kept" | "private";

export interface Notice {
  readonly text: string;
  readonly kind: "input-error" | "save-error" | "save-note";
}

export const NOTICES: Readonly<Record<NoticeKey, Notice>> = {
  empty: { text: "Paste a link first.", kind: "input-error" },
  invalid: {
    text: "That doesn’t look like a link. Links must start with https:// or http://.",
    kind: "input-error",
  },
  failed: { text: "Couldn’t save this link.", kind: "save-error" },
  refused: {
    text: "This link leads to a private network or your computer, so it was saved without a title.",
    kind: "save-note",
  },
  unsupported: {
    text: "This link redirected to an address that isn’t a web page, so it was saved without a title.",
    kind: "save-note",
  },
  "redirect-limit": {
    text: "This link redirected too many times, so it was saved without a title.",
    kind: "save-note",
  },
  "redirect-stopped": {
    text: "This link redirected to Reddit or X, so it was saved without a title.",
    kind: "save-note",
  },
  status: {
    text: "The website answered with an error, so this link was saved without a title.",
    kind: "save-note",
  },
  "no-title": {
    text: "This page has no title, so the link was saved without one.",
    kind: "save-note",
  },
  unreadable: {
    text: "Couldn’t read Reddit’s answer, so this link was saved without a title.",
    kind: "save-note",
  },
  "title-kept": {
    text: "Couldn’t update the title for this link, so the title saved earlier was kept.",
    kind: "save-note",
  },
  private: {
    text: "Links to a private network or your own computer can’t be saved.",
    kind: "input-error",
  },
};

export const DISMISS_LABEL = "Dismiss";
export const RETRY_LABEL = "Try again";

export const CARD_TITLES = {
  reading: "Reading the link",
  added: "Added",
  refreshed: "Already saved, refreshed",
} as const;

export const READING_NOTE = "Usually done within a minute";

export const FAILURE_TITLES: Readonly<Record<FailureReason, string>> = {
  timeout: "The website didn’t answer in time",
  network: "Couldn’t reach the website",
  "gave-up": "Something went wrong while reading the link",
};

export const SORT_LABEL = "Newest saved first";
export const NEW_TAB_LABEL = "opens in a new tab";
export const LOADING_LABEL = "Loading saved links…";

export const LOAD_FAILED = "Couldn’t load your saved links.";

export const SETTINGS_GEAR_LABEL = "Settings";
export const SETTINGS_TITLE = "Settings";
export const CLOSE_LABEL = "Close";
export const RESET_LABEL = "Reset look";

export const RESET_NOTE =
  "Reset look puts look settings back to their defaults and leaves Theme alone.";

export const MATCH_SYSTEM_NOTES = {
  dark: "Match system · dark now",
  light: "Match system · light now",
} as const;

const COUNT_ONE = "1 link saved";
const COUNT_MANY = "{count} links saved";

export function countLabel(count: number): string {
  return count === 1 ? COUNT_ONE : filled(COUNT_MANY, { count: String(count) });
}

export const EMPTY_LIST = {
  heading: "Nothing saved yet",
  line: "Paste a link in the box and press Add.",
} as const;

export const SOURCE_LABELS: Readonly<Record<Source, string>> = {
  reddit: "Reddit",
  x: "X",
  github: "GitHub",
  other: "Other",
};
