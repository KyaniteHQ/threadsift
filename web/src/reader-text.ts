import type { Kind, Source } from "../../src/core/kinds.ts";
import { ageLabel } from "./saved-label.ts";
import { CLOSE_LABEL, filled } from "./text.ts";

export const READER_PLACEHOLDER = "Select an item";
export const MARK_READ = "Mark read";
export const MARK_UNREAD = "Mark unread";
export const ROW_MARK_READ = "Mark as read";
export const ROW_MARK_UNREAD = "Mark as unread";
export const MARKED_READ = "Marked as read";
export const MARKED_UNREAD = "Marked as unread";
export const READ_FAILED = "Couldn’t change this item’s read state.";
export const BACK_LONG = "Back to list";
export const BACK_TO_GRID = "Back to grid";
export const BACK_SHORT = "Back";
export const PREVIOUS_ITEM = "Previous item";
export const NEXT_ITEM = "Next item";
export const HINT_LIST = "j k move · Enter open · m read · / search";
export const HINT_PANE = "j k move · Enter open · m read · / search · Esc close";
export const READER_LOADING = "Loading item…";
export const READER_FAILED = "Couldn’t load this item.";
export const SUMMARY_LABEL = "Summary";
export const KEY_POINTS_LABEL = "Key points";
export const DIGEST_PENDING = "The summary and key points are not ready yet.";
export const NO_POST_TEXT = "This item has no post text.";
export const PASTE_OPEN = "Open";
export const FOLD_HIDE = "Show fewer lines";
export const FOOTNOTES_LABEL = "Footnotes";
export const FOOTNOTE_BACK = "Back to reference {reference}";
export const FOOTNOTE_BACK_AGAIN = "Back to footnote {reference}, reference {again}";

export const OPEN_LABELS: Readonly<Record<Source, string>> = {
  reddit: "Open on Reddit",
  x: "Open on X",
  github: "Open on GitHub",
  article: "Open article",
  other: "Open link",
};

export const SECTION_TITLES: Readonly<Record<Kind, string>> = {
  "reddit-post": "Original post",
  "reddit-comment": "Original post",
  "x-post": "Original post",
  "github-repo": "README",
  article: "Article",
  link: "Original post",
};

const POSTED = "posted {when}";
const CODE_ONE = "Code block, 1 line";
const CODE_MANY = "Code block, {count} lines";
const TABLE_NAME = "Table, {count} columns";
const FOLD_SHOW = "Show all {count} lines";

export function postedLabel(postedAt: number, now: number): string {
  return filled(POSTED, { when: ageLabel(postedAt, now) });
}

export function codeName(lines: number): string {
  return lines === 1 ? CODE_ONE : filled(CODE_MANY, { count: String(lines) });
}

export function tableName(columns: number): string {
  return filled(TABLE_NAME, { count: String(columns) });
}

export function foldShowLabel(lines: number): string {
  return filled(FOLD_SHOW, { count: String(lines) });
}

export interface Leave {
  readonly long: string;
  readonly short: string;
  readonly icon: "left" | "close";
}

export function leaveOf(sheet: boolean, grid: boolean): Leave {
  if (sheet) return { long: CLOSE_LABEL, short: CLOSE_LABEL, icon: "close" };

  return { long: grid ? BACK_TO_GRID : BACK_LONG, short: BACK_SHORT, icon: "left" };
}
