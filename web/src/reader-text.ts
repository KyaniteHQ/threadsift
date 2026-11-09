import { groupedNumber } from "../../src/core/format.ts";
import type { Kind, Source } from "../../src/core/kinds.ts";
import type { CommentCounts } from "./comment-counts.ts";
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
export const DELETE_LABEL = "Delete";
export const DELETE_TITLE = "Delete this item?";

export const DELETE_DESCRIPTION =
  "Deleting removes this item, its summary and key points, its saved text and its kept comments from the library. This can’t be undone.";

export const CANCEL_LABEL = "Cancel";
export const DELETE_CONFIRM = "Delete item";
export const DELETE_PENDING = "Deleting item…";
export const DELETE_FAILED = "Couldn’t delete this item. Try again.";
export const DELETED = "Item deleted.";
export const BACK_LONG = "Back to list";
export const BACK_TO_GRID = "Back to grid";
export const BACK_SHORT = "Back";
export const PREVIOUS_ITEM = "Previous item";
export const NEXT_ITEM = "Next item";
export const HINT_LIST = "j k move · Enter open · m read · / search";
export const HINT_PANE = "j k move · Enter open · m read · / search · Esc close";
export const READER_LOADING = "Loading item…";
export const READER_FAILED = "Couldn’t load this item.";
export const READER_STALE = "This text is from earlier and may be outdated.";
export const POST_TEXT_FAILED = "Couldn’t show this item’s post text and comments.";
export const SUMMARY_LABEL = "Summary";
export const KEY_POINTS_LABEL = "Key points";
export const DIGEST_PENDING = "The summary and key points are not ready yet.";
export const NO_POST_TEXT = "This item has no post text.";
export const NO_README = "This repository has no Markdown README.";
export const GITHUB_TOPICS_LABEL = "Topics on GitHub";
export const NONE_STATED = "None stated";
export const PASTE_OPEN = "Open";
export const FOLD_HIDE = "Show fewer lines";
export const COMMENTS_TITLE = "Comments";
export const NONE_KEPT = "None of the comments added anything the post doesn't already say.";
export const CONTEXT_LABEL = "Context";
export const STUB_DROPPED = "Removed comment shown so the replies below make sense.";
export const STUB_NOT_KEPT = "Comment not kept, shown so the replies below make sense.";
export const STUB_MORE = "Further replies were not saved.";
export const OP_LABEL = "OP";
export const SHOW_FULL_COMMENT = "Show full comment";
export const SHOW_LESS = "Show less";
export const FOOTNOTES_LABEL = "Footnotes";
export const FOOTNOTE_BACK = "Back to reference {reference}";
export const FOOTNOTE_BACK_AGAIN = "Back to footnote {reference}, reference {again}";

export const REPOSITORY_LABELS = {
  stars: "Stars",
  language: "Language",
  license: "License",
  pushedAt: "Last push",
} as const;

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
const COMMENTS_KEPT = "Kept {kept} of {total} comments";
const COMMENTS_BUTTON = "Comments {kept} of {total}";
const COMMENTS_BUTTON_SHORT = "{kept} of {total}";
const COMMENTS_BUTTON_COUNT = "{kept}";
const SCORE = "{score} pts";

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

function numbers({ kept, total }: Readonly<CommentCounts>) {
  return { kept: groupedNumber(kept), total: groupedNumber(total) };
}

export function keptLabel(counts: Readonly<CommentCounts>): string {
  return filled(COMMENTS_KEPT, numbers(counts));
}

export function commentsButtonLabels(counts: Readonly<CommentCounts>) {
  const values = numbers(counts);

  return {
    full: filled(COMMENTS_BUTTON, values),
    short: filled(COMMENTS_BUTTON_SHORT, values),
    count: filled(COMMENTS_BUTTON_COUNT, values),
  };
}

export function scoreLabel(score: number): string {
  return filled(SCORE, { score: groupedNumber(score) });
}
