import type { FetchFailure } from "../../src/core/contract/fetch-results.ts";
import { groupedNumber } from "../../src/core/contract/format.ts";
import type { FailureReason, ReadState, Source } from "../../src/core/contract/item-contract.ts";
import type { WaitReason } from "../../src/core/contract/job-contract.ts";
import type { XReadNote } from "../../src/core/contract/x-read-note.ts";
import { filled } from "./filled.ts";
import { type XNoticeKey, X_NOTICES } from "./x-text.ts";

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
  | "restoring"
  | "title-kept"
  | XNoticeKey
  | "private";

export const INPUT_ERRORS: ReadonlySet<NoticeKey> = new Set(["empty", "invalid", "private"]);

export const NOTICES: Readonly<Record<NoticeKey, string>> = {
  empty: "Paste a link first.",
  invalid: "That doesn’t look like a link. Links must start with https:// or http://.",
  failed: "Couldn’t save this link.",
  restoring:
    "A Restore is running, so this link wasn’t saved. Paste the link again when the Restore has finished.",
  refused:
    "This link leads to a private network or a loopback address, so it was saved without a title.",
  unsupported:
    "This link redirected to an address that isn’t a web page, so it was saved without a title.",
  "redirect-limit": "This link redirected too many times, so it was saved without a title.",
  "redirect-stopped": "This link redirected to Reddit or X, so it was saved without a title.",
  unresolved:
    "Couldn’t find the post or comment this link points to, so it was saved as it is, without a title.",
  status: "The website answered with an error, so this link was saved without a title.",
  "no-title": "This page has no title, so the link was saved without one.",
  unreadable: "Couldn’t read the website’s answer, so this link was saved without a title.",
  "github-token":
    "GitHub rejected the saved token, so this Item wasn’t updated. Replace or remove the token in Settings, then paste the link again.",
  ...X_NOTICES,
  "title-kept": "Couldn’t update the title for this link, so the title saved earlier was kept.",
  private: "Links to a private network or a loopback address can’t be saved.",
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

const FAILURE_TITLES: Readonly<Record<FailureReason, string>> = {
  timeout: "The website didn’t answer in time",
  network: "Couldn’t reach the website",
  "gave-up": "Something went wrong while reading the link",
  "rate-limited": "The link wasn’t updated because GitHub kept limiting requests",
};

export function failureTitleOf({
  reason,
  xNote,
}: Readonly<{ reason: FailureReason; xNote: XReadNote | null }>): string {
  return xNote === null ? FAILURE_TITLES[reason] : NOTICES[xNote];
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
      "The grok CLI couldn’t read the post this time, so Threadsift will read it again {when}.",
    due: "The grok CLI couldn’t read the post this time, so Threadsift is waiting to read it again.",
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

export const RESET_NOTE =
  "Look settings return to their defaults. Layout, Open items as and Theme stay as they are.";

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
