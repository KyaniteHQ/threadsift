import type { FetchFailure } from "../../src/core/contract/fetch-results.ts";
import { groupedNumber } from "../../src/core/contract/format.ts";
import type { FailureReason, ReadState, Source } from "../../src/core/contract/item-contract.ts";
import type { WaitReason } from "../../src/core/contract/job-contract.ts";
import type { XReadNote } from "../../src/core/contract/x-read-note.ts";
import { filled } from "./filled.ts";
import { type XNoticeKey, X_NOTICES } from "./x-text.ts";

export const PASTE_LABEL = "Link to add";
export const PASTE_PLACEHOLDER = "Paste a link";
export const ADD_LABEL = "Add";
export const SAVING_LABEL = "Saving…";
export const SAVING_STATUS = "Saving the link and reading the page title…";

export type NoteKey = Exclude<FetchFailure, "timeout" | "network">;

export type NoticeKey =
  | NoteKey
  | "empty"
  | "invalid"
  | "failed"
  | "restoring"
  | "title-kept"
  | XNoticeKey
  | "private";

export const INPUT_ERRORS: ReadonlySet<NoticeKey> = new Set(["empty", "invalid", "private"]);

export const NOTICES: Readonly<Record<NoticeKey, string>> = {
  empty: "Paste a link first.",
  invalid: "Links must start with https:// or http://.",
  failed: "Couldn’t save this link.",
  restoring:
    "Couldn’t save this link while a restore is running. Paste it again after the restore finishes.",
  refused:
    "Saved without a title. This link leads to an address that isn’t reachable from the public internet.",
  unsupported: "Saved without a title. This link redirected to an address that isn’t a web page.",
  "redirect-limit": "Saved without a title. This link redirected too many times.",
  "redirect-stopped":
    "Saved without a title. This link redirected to Reddit or X, which Threadsift doesn’t follow from another website.",
  unresolved:
    "Saved as pasted, without a title. Couldn’t find the post or comment this link points to.",
  status: "Saved without a title. The website answered with an error.",
  "no-title": "Saved without a title because the page has none.",
  unreadable: "Saved without a title. Couldn’t read the website’s answer.",
  "github-token":
    "Couldn’t update this item because GitHub rejected the saved token. Replace or remove the token in Settings, then paste the link again.",
  ...X_NOTICES,
  "title-kept": "Couldn’t read a new title. The saved one was kept.",
  private: "This link can’t be saved. Its address isn’t reachable from the public internet.",
};

export const TOKEN_REFUSED = {
  row: "Couldn’t update this item because GitHub rejected the saved token.",
  reader: "Couldn’t update this item because GitHub rejected the saved token.",
  link: "Open Settings",
} as const;

export const DISMISS_LABEL = "Dismiss";
export const RETRY_LABEL = "Try again";

export const CARD_TITLES = {
  reading: "Reading the link…",
  added: "Added",
  refreshed: "Already saved and refreshed",
} as const;

const FAILURE_TITLES: Readonly<Record<FailureReason, string>> = {
  timeout: "The website didn’t answer in time",
  network: "Couldn’t reach the website",
  "gave-up": "Couldn’t read the link",
  "rate-limited": "Couldn’t update this item because GitHub kept limiting requests",
};

export function failureTitleOf({
  reason,
  xNote,
}: Readonly<{ reason: FailureReason; xNote: XReadNote | null }>): string {
  return xNote === null ? FAILURE_TITLES[reason] : NOTICES[xNote];
}

export const WAITING = {
  "github-rate-limit": {
    title: "Waiting for GitHub…",
    until: "GitHub is limiting requests. Threadsift will try again {when}.",
    due: "GitHub is limiting requests. Threadsift will try again.",
  },
  "grok-bot": {
    title: "Waiting for Grok Bot…",
    until: "Grok Bot is reading this item. Threadsift will check again {when}.",
    due: "Grok Bot is reading this item. Threadsift will check again.",
  },
  "reddit-limit": {
    title: "Waiting for Reddit…",
    until:
      "Threadsift reads one Reddit thread at a time within Reddit’s request limit and will check this one again {when}.",
    due: "Threadsift reads one Reddit thread at a time within Reddit’s request limit and will check this one again.",
  },
  "x-verify": {
    title: "Waiting for X…",
    until: "X isn’t answering or is limiting requests. Threadsift will try again {when}.",
    due: "X isn’t answering or is limiting requests. Threadsift will try again.",
  },
  "x-reread": {
    title: "Waiting for the grok CLI…",
    until: "The grok CLI couldn’t read this X post. Threadsift will try again {when}.",
    due: "The grok CLI couldn’t read this X post. Threadsift will try again.",
  },
  "topic-busy": {
    title: "Waiting for the topic…",
    until: "This item’s topic is updating. Threadsift will try again {when}.",
    due: "This item’s topic is updating. Threadsift will try again.",
  },
} as const satisfies Record<WaitReason, Readonly<{ title: string; until: string; due: string }>>;

export function waitTitle({ reason }: Readonly<{ reason: WaitReason }>): string {
  return WAITING[reason].title;
}

export const SORT_LABEL = "Newest saved first";
export const LOADING_LABEL = "Loading Items…";

export const LOAD_MORE = "Load more";
export const LOADING_MORE = "Loading more…";
export const NEWEST_FIRST = "Newest first";
export const BACK_TO_LIBRARY = "Back to library";
export const LOAD_FAILED = "Couldn’t load the Items.";

export const SETTINGS_GEAR_LABEL = "Settings";
export const SETTINGS_TITLE = "Settings";
export const CLOSE_LABEL = "Close";
export const RESET_LABEL = "Reset look";

export const RESET_NOTE = "Layout, Open items as and Theme stay as they are.";

export const MATCH_SYSTEM_NOTES = {
  dark: "Match system · dark now",
  light: "Match system · light now",
} as const;

export const SEARCH_LABEL = "Search Items";
export const SEARCH_PLACEHOLDER = "Title, post text, Summary or Tags";
export const SKIP_LABEL = "Skip to Items";

export const FILTER_GROUPS = {
  source: "Source",
  read: "Read state",
  topic: "Topic",
  tag: "Tags",
} as const;

export const ALL_CHOICE = "All";

export const ALL_NAMED = {
  source: "All {count} from all Sources",
  read: "All {count} in all Read states",
} as const;

export const READ_LABELS: Readonly<Record<ReadState, string>> = {
  unread: "Unread",
  read: "Read",
};

export const ALL_ROWS = { topic: "All {count} Topics", tag: "All {count} Tags" } as const;
export const SHOW_FEWER = "Show fewer";
export const FILTERS_BUTTON = "Filters";
export const FILTERS_BUTTON_ACTIVE = "Filters · {count}";
export const CLEAR_FILTERS = "Clear filters";
export const ANY_CHOICE = { topic: "Any Topic", tag: "Any Tag" } as const;
const NAMED_OPTION = "{name} ({count})";

export function namedOption(name: string, count: number): string {
  return filled(NAMED_OPTION, { name, count: String(count) });
}

export const NO_ROWS = { topic: "No Topics yet", tag: "No Tags yet" } as const;

export const NO_RESULTS = "No Items match";
export const CLEAR_ALL = "Clear search and filters";

const TOTAL_NAME_ONE = "1 Item in library";
const TOTAL_NAME_MANY = "{count} Items in library";

export function totalName(count: number): string {
  return count === 1 ? TOTAL_NAME_ONE : filled(TOTAL_NAME_MANY, { count: String(count) });
}

export const EMPTY_LIST = {
  heading: "No Items yet",
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

export const STYLE_NOTE = "Set by the Style";
export const OPEN_AS_NARROW_NOTE = "Items open as a full page at this width.";
export const NO_DIGEST = "No Digest";
export const DIGEST_NOT_UPDATED = "Digest not updated";

export const FIELD_TEXT = {
  required: "Enter a value.",
  legend: "Fields marked with * are required.",
  spoken: (label: string): string => `${label}: ${FIELD_TEXT.required}`,
  mark: " *",
} as const;
