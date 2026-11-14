import type { FetchFailure } from "../../src/core/fetch-results.ts";
import type { FilterCounts } from "../../src/core/filter-counts-contract.ts";
import { groupedNumber } from "../../src/core/format.ts";
import type {
  FailureReason,
  ReadState,
  Source,
  WaitReason,
  XReadNote,
} from "../../src/core/kinds.ts";
import { type XNoticeKey, X_NOTICES } from "./x-text.ts";

export function filled(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, () => value),
    template,
  );
}

export const PASTE_LABEL = "Paste a link to save";
export const PASTE_PLACEHOLDER = "Paste a link";
export const ADD_LABEL = "Add";
export const SAVING_LABEL = "Saving…";
export const SAVING_STATUS = "Saving link and fetching page title…";

export type NoteKey = Exclude<FetchFailure, "timeout" | "network">;

export type NoticeKey =
  | NoteKey
  | "empty"
  | "invalid"
  | "failed"
  | "updating"
  | "title-kept"
  | XNoticeKey
  | "private";

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
  updating: {
    text: "The library is finishing an update, so this link wasn’t saved. Paste the link again in a minute.",
    kind: "save-error",
  },
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
  unresolved: {
    text: "Couldn’t find the post or comment this link points to, so it was saved as it is, without a title.",
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
    text: "Couldn’t read the website’s answer, so this link was saved without a title.",
    kind: "save-note",
  },
  "github-token": {
    text: "GitHub rejected the saved token, so this Item wasn’t updated. Replace or remove the token in Settings, then paste the link again.",
    kind: "save-note",
  },
  ...X_NOTICES,
  "title-kept": {
    text: "Couldn’t update the title for this link, so the title saved earlier was kept.",
    kind: "save-note",
  },
  private: {
    text: "Links to a private network or your own computer can’t be saved.",
    kind: "input-error",
  },
};

export const TOKEN_REFUSED = {
  row: "Couldn’t update this Item because GitHub rejected the saved token.",
  reader: "Threadsift couldn’t update this Item because GitHub rejected the saved token.",
  link: "Open Settings",
} as const;

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
  "rate-limited": "The link wasn’t updated because GitHub kept limiting requests",
};

export function failureTitleOf({
  reason,
  xNote,
}: Readonly<{ reason: FailureReason; xNote?: XReadNote | null | undefined }>): string {
  return xNote === null || xNote === undefined ? FAILURE_TITLES[reason] : NOTICES[xNote].text;
}

export const WAITING = {
  "github-rate-limit": {
    title: "Waiting for GitHub",
    until: "GitHub is limiting requests, so Threadsift will try again {when}.",
    due: "GitHub is limiting requests, so Threadsift is waiting to retry.",
  },
  "grok-bot": {
    title: "Waiting for Grok Bot",
    until: "Grok Bot is reading this Item, so Threadsift will check again {when}.",
    due: "Grok Bot is reading this Item, so Threadsift is waiting to check.",
  },
  "reddit-limit": {
    title: "Waiting for Reddit",
    until:
      "Threadsift reads Reddit threads one at a time within Reddit’s limit and will check this one again {when}.",
    due: "Threadsift reads Reddit threads one at a time within Reddit’s limit and is waiting to check.",
  },
  "x-verify": {
    title: "Waiting for X",
    until: "X isn’t answering or is limiting requests, so Threadsift will try again {when}.",
    due: "X isn’t answering or is limiting requests, so Threadsift is waiting to retry.",
  },
  "x-reread": {
    title: "Waiting for the grok CLI",
    until:
      "The grok CLI couldn’t read the post and X didn’t say the post is gone, so Threadsift will read it again {when}.",
    due: "The grok CLI couldn’t read the post and X didn’t say the post is gone, so Threadsift is waiting to read it again.",
  },
  "topic-busy": {
    title: "Waiting for Topic",
    until: "This Topic is updating, so Threadsift will try again {when}.",
    due: "This Topic is updating, so Threadsift is waiting to try again.",
  },
} as const satisfies Record<WaitReason, Readonly<{ title: string; until: string; due: string }>>;

export function waitTitle({ reason }: Readonly<{ reason: WaitReason }>): string {
  return WAITING[reason].title;
}

export const BLANK = "\u00A0";
export const SORT_LABEL = "Newest saved first";
export const LOADING_LABEL = "Loading saved links…";

export const LOAD_MORE = "Load more";
export const LOADING_MORE = "Loading more…";
export const NEWEST_FIRST = "Newest first";
export const BACK_TO_LIBRARY = "Back to library";
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

export const SEARCH_LABEL = "Search items";
export const SEARCH_PLACEHOLDER = "Search title, post text, summary or tags";

export const FILTER_GROUPS = {
  source: "Source",
  read: "Read state",
  topic: "Topic",
  tag: "Tags",
} as const;

export const ALL_CHOICE = "All";

export const ALL_NAMED = {
  source: "All {count} from all sources",
  read: "All {count} in all read states",
} as const;

export const READ_LABELS: Readonly<Record<ReadState, string>> = {
  unread: "Unread",
  read: "Read",
};

export const ALL_ROWS = { topic: "All {count} topics", tag: "All {count} tags" } as const;
export const SHOW_FEWER = "Show fewer";
export const FILTERS_BUTTON = "Filters";
export const FILTERS_BUTTON_ACTIVE = "Filters · {count}";
export const CLEAR_FILTERS = "Clear filters";
export const ANY_CHOICE = { topic: "Any topic", tag: "Any tag" } as const;
const NAMED_OPTION = "{name} ({count})";

export function namedOption(name: string, count: number): string {
  return filled(NAMED_OPTION, { name, count: String(count) });
}

export const NO_ROWS = { topic: "No topics yet", tag: "No tags yet" } as const;

const HEAD_ONE = "1 item, {unread} unread";
const HEAD_MANY = "{total} items, {unread} unread";
const HEAD_MATCHING = "{shown} of {total} items";
const HEAD_MATCHING_TEXT = "{shown} of {total} items matching “{text}”";

export function headLabel(
  counts: Readonly<Pick<FilterCounts, "total" | "unread">>,
  shown: number | null,
  text: string,
): string {
  const values = {
    total: String(counts.total),
    unread: String(counts.unread),
    shown: String(shown ?? 0),
    text,
  };

  if (shown === null) return filled(counts.total === 1 ? HEAD_ONE : HEAD_MANY, values);

  return filled(text === "" ? HEAD_MATCHING : HEAD_MATCHING_TEXT, values);
}

export const NO_RESULTS = "No items match";
export const CLEAR_ALL = "Clear search and filters";

const TOTAL_NAME_ONE = "1 item in library";
const TOTAL_NAME_MANY = "{count} items in library";

export function totalName(count: number): string {
  return count === 1 ? TOTAL_NAME_ONE : filled(TOTAL_NAME_MANY, { count: String(count) });
}

export const EMPTY_LIST = {
  heading: "Nothing saved yet",
  line: "Paste a link in the box and press Add.",
} as const;

export const SOURCE_LABELS: Readonly<Record<Source, string>> = {
  reddit: "Reddit",
  x: "X",
  github: "GitHub",
  article: "Article",
  other: "Other",
};

const STARS_ONE = "{count} star";
const STARS_MANY = "{count} stars";

export function starsLabel(count: number): string {
  return filled(count === 1 ? STARS_ONE : STARS_MANY, { count: groupedNumber(count) });
}

export const SAVED_COMMENT = "Saved comment";

export const STYLE_NOTE = "Set by the style";
export const OPEN_AS_NARROW_NOTE = "Items open as a full page at this width.";
export const NO_DIGEST = "No Digest";

export const DIGEST_NOT_UPDATED = "Digest not updated";
