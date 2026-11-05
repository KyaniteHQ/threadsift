import type { Source } from "../../src/core/kinds.ts";

export const PASTE_LABEL = "Paste a link to save";
export const PASTE_PLACEHOLDER = "Paste a link";
export const ADD_LABEL = "Add";
export const SAVING_LABEL = "Saving…";
export const SAVING_STATUS = "Saving link and fetching page title…";

export const NOTICES = {
  empty: "Paste a link first.",
  invalid: "That doesn’t look like a link. Links must start with https:// or http://.",
  failed: "Couldn’t save this link.",
  timeout: "The website didn’t answer in time, so this link was saved without a title.",
  refused:
    "This link leads to a private network or your computer, so it was saved without a title.",
  unsupported:
    "This link redirected to an address that isn’t a web page, so it was saved without a title.",
  "redirect-limit": "This link redirected too many times, so it was saved without a title.",
  "redirect-stopped": "This link redirected to Reddit or X, so it was saved without a title.",
  status: "The website answered with an error, so this link was saved without a title.",
  network: "Couldn’t reach the website, so this link was saved without a title.",
  "no-title": "This page has no title, so the link was saved without one.",
  unreadable: "Couldn’t read Reddit’s answer, so this link was saved without a title.",
  "title-kept": "Couldn’t update the title for this link, so the title saved earlier was kept.",
  private: "Links to a private network or your own computer can’t be saved.",
} as const;

export type NoticeKey = keyof typeof NOTICES;

export const NOTICE_KINDS: Readonly<Record<NoticeKey, "input-error" | "save-error" | "save-note">> =
  {
    empty: "input-error",
    invalid: "input-error",
    failed: "save-error",
    private: "input-error",
    timeout: "save-note",
    refused: "save-note",
    unsupported: "save-note",
    "redirect-limit": "save-note",
    "redirect-stopped": "save-note",
    status: "save-note",
    network: "save-note",
    "no-title": "save-note",
    unreadable: "save-note",
    "title-kept": "save-note",
  };

export const RETRYABLE_NOTICES: ReadonlySet<NoticeKey> = new Set(["timeout", "network"]);

export const DISMISS_LABEL = "Dismiss";
export const RETRY_LABEL = "Try again";
export const SORT_LABEL = "Newest saved first";
export const NEW_TAB_LABEL = "opens in a new tab";
export const LOADING_LABEL = "Loading saved links…";

export const LOAD_FAILED = "Couldn’t load your saved links.";

const COUNT_ONE = "1 link saved";
const COUNT_MANY = "{count} links saved";

export function countLabel(count: number): string {
  return count === 1 ? COUNT_ONE : COUNT_MANY.replace("{count}", String(count));
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
