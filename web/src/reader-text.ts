import type { CommentCount, UnfilteredCause } from "../../src/core/contract/comment-view.ts";
import { collapsed, groupedNumber } from "../../src/core/contract/format.ts";
import { CONTEXT_CODE_POINTS } from "../../src/core/contract/highlight-anchor.ts";
import type { Source } from "../../src/core/contract/item-contract.ts";
import { NOTE_MAX_CODE_POINTS } from "../../src/core/contract/note-contract.ts";
import { UNTITLED } from "../../src/core/contract/reader-text.ts";
import { STORED_PICTURE_TEXT } from "../../src/core/contract/reader-url.ts";
import { filled } from "./filled.ts";
import { plural } from "./plural.ts";
import { ageLabel, dateLabel } from "./saved-label.ts";
import { CLOSE_LABEL } from "./text.ts";

export const READER_PLACEHOLDER = "Select an item";
export const MARK_READ = "Mark read";
export const MARK_UNREAD = "Mark unread";
export const ROW_MARK_READ = "Mark as read";
export const ROW_MARK_UNREAD = "Mark as unread";
export const MARKED_READ = "Marked as read";
export const MARKED_UNREAD = "Marked as unread";
export const READ_FAILED = "Couldn’t change this item’s read state. Try again.";
export const DELETE_LABEL = "Delete";
export const DELETE_TITLE = "Delete this item?";

export const DELETE_DESCRIPTION =
  "Its highlights, note, digest, saved content, images and log entries will be removed. This can’t be undone.";

export const CANCEL_LABEL = "Cancel";
export const DELETE_CONFIRM = "Delete item";
export const DELETE_PENDING = "Deleting item…";
export const DELETE_FAILED = "Couldn’t delete this item. Try again.";
export const DELETED = "Item deleted";
const BACK_LONG = "Back to list";
const BACK_TO_GRID = "Back to grid";
const BACK_SHORT = "Back";
export const PREVIOUS_ITEM = "Previous item";
export const NEXT_ITEM = "Next item";
export const HINT_LIST = "j k move · Enter open · m read · / search";
export const HINT_PANE = "j k move · Enter open · m read · / search · Esc close";
export const READER_LOADING = "Loading item…";
export const READER_FAILED = "Couldn’t load this item.";
export const READER_STALE = "Couldn’t reload this item. Showing an earlier copy.";
export const DIGEST_PENDING = "Writing the summary and key points…";
export const NO_POST_TEXT = "This item has no post text.";

export const FILL_NOTE =
  "The post and comments aren’t saved yet. Open the post on Reddit in a browser with the Threadsift extension and its filling turned on to save them.";

const ARCHIVE_NOTE = "The post and comments were saved from the Arctic Shift archive on {date}.";

const ARCHIVE_COMMENTS_NOTE =
  "Only the comments were saved from the Arctic Shift archive on {date}.";

export const NO_README = "This repository has no Markdown README.";
export const GITHUB_TOPICS_LABEL = "Topics on GitHub";
export const NONE_STATED = "None stated";
export const PASTE_OPEN = "Open";
export const FOLD_HIDE = "Show fewer lines";
export const NONE_KEPT = "The digest found no comments to keep.";

const UNFILTERED_LEAD = "These comments aren’t filtered by a digest.";

export const UNFILTERED_NOTES = {
  pending: `${UNFILTERED_LEAD} One is being made now. Only kept comments will show when it’s ready.`,
  failed: `${UNFILTERED_LEAD} The last digest run failed.`,
  "no-provider": `${UNFILTERED_LEAD} Save a provider so Threadsift can make one.`,
  "not-run": `${UNFILTERED_LEAD} A provider is saved, but this item has no digest yet.`,
  older: `${UNFILTERED_LEAD} This item’s digest was made from earlier text and doesn’t cover them.`,
} as const satisfies Record<UnfilteredCause, string>;

export const ALL_REMOVED =
  "Every saved comment in this thread was removed, empty, from a bot or only a short agreement.";

export const OP_LABEL = "OP";
export const SHOW_FULL_COMMENT = "Show full comment";
export const SHOW_LESS = "Show less";
export const KEEP_LABEL = "Keep";
export const KEEP_GROUP = "Keep highlight";
export const REMOVE_LABEL = "Remove";
export const REMOVE_GROUP = "Remove highlight";
export const RELATED = { title: "Related items", untitled: UNTITLED } as const;
export const KEPT_ANNOUNCEMENT = "Highlight kept";
export const REMOVED_ANNOUNCEMENT = "Highlight removed";
export const KEEP_FAILED = "Couldn’t keep this highlight. Select the passage again.";
export const KEEP_RESTORING =
  "Couldn’t keep this highlight because a restore holds the library. Press Keep again once the restore has finished or been cancelled in Backup in Settings.";
export const KEEP_REFUSED =
  "Couldn’t keep this highlight. Select a smaller passage without pictures, footnotes or code.";
export const SELECT_FAILED = "Can’t keep passages right now because part of the page didn’t load.";
export const REMOVE_FAILED = "Couldn’t remove this highlight. Try again.";

export const KEEP_STALE =
  "Couldn’t keep this highlight because the item’s text changed. Select the passage again once the new text appears.";

export const NOTE_SAVE = "Save";
export const NOTE_SAVED = "Saved";
export const NOTE_FAILED = "Couldn’t save this note. Your text is still in the field. Try again.";
export const NOTE_RESTORING =
  "Couldn’t save your note because a restore holds the library; it stays in the field. Press Save again once the restore has finished or been cancelled in Backup in Settings.";
export const NOTE_TOO_LONG = `This note is over the limit of ${groupedNumber(NOTE_MAX_CODE_POINTS)} characters. Shorten it to save.`;
export const NOTE_CHANGED = "This note changed in another tab or device.";
export const NOTE_NEWER_EMPTY = "The newer version is empty.";
export const NOTE_KEEP_MINE = "Save your version";
export const NOTE_USE_NEWER = "Use newer version";
export const NOTE_KEYS = "Ctrl+Enter or Cmd+Enter to save";
export const NOTE_NEWER_LABEL = "Newer version";

export const FOOTNOTES_LABEL = "Footnotes";
const FOOTNOTE_BACK = "Back to text, footnote {reference}";
const FOOTNOTE_BACK_AGAIN = "Back to text, footnote {reference}, reference {again}";

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

export const PICTURE_LABEL = "Image";

const REMOVE_NAMED = "Remove highlight: {quote}";
const QUOTE_SHORT_CODE_POINTS = 40;
export const ELLIPSIS = "…";
const POSTED = "posted {when}";
const CODE_ONE = "Code block, 1 line";
const CODE_MANY = "Code block, {count} lines";
const TABLE_ONE = "Table, 1 column";
const TABLE_MANY = "Table, {count} columns";
const FOLD_SHOW = "Show all {count} lines";

const COUNT_TEXTS = {
  kept: { row: "Kept {shown} of {total}", heading: "Kept {shown} of {total}" },
  unfiltered: {
    row: "Showing {shown} of {total}",
    heading: "Showing {shown} of {total}",
  },
} as const satisfies Record<CommentCount["filter"], Record<"row" | "heading", string>>;

const COMMENTS_BUTTON = "Comments {shown} of {total}";
const COMMENTS_BUTTON_SHORT = "{shown} of {total}";
const COMMENTS_BUTTON_COUNT = "{shown}";
const SCORE_ONE = "{count} point";
const SCORE_MANY = "{count} points";
const LIKES = "Likes: {count}";

export function footnoteBackLabel(referenceIndex: number, rereferenceIndex: number): string {
  const values = {
    reference: String(referenceIndex + 1),
    again: String(rereferenceIndex),
  };

  return filled(rereferenceIndex > 1 ? FOOTNOTE_BACK_AGAIN : FOOTNOTE_BACK, values);
}

export function contextTail(prefix: string): string {
  const points = Array.from(prefix);
  const kept = CONTEXT_CODE_POINTS / 2;

  return points.length > kept ? `${ELLIPSIS}${points.slice(-kept).join("")}` : prefix;
}

export function quoteEnds(exact: string): { readonly head: string; readonly tail: string | null } {
  const points = Array.from(exact);
  const edge = QUOTE_SHORT_CODE_POINTS / 2;

  return points.length > QUOTE_SHORT_CODE_POINTS
    ? { head: points.slice(0, edge).join(""), tail: points.slice(-edge).join("") }
    : { head: exact, tail: null };
}

export function removeNamed(exact: string): string {
  const words = collapsed(exact.replaceAll(STORED_PICTURE_TEXT, PICTURE_LABEL));
  const points = Array.from(words);

  const quote =
    points.length > QUOTE_SHORT_CODE_POINTS
      ? `${points.slice(0, QUOTE_SHORT_CODE_POINTS).join("")}${ELLIPSIS}`
      : words;

  return filled(REMOVE_NAMED, { quote });
}

export function postedLabel(postedAt: number, now: number): string {
  return filled(POSTED, { when: ageLabel(postedAt, now) });
}

export function archiveNote(
  { at, withPost }: Readonly<{ at: number; withPost: boolean }>,
  now: number,
): string {
  return filled(withPost ? ARCHIVE_NOTE : ARCHIVE_COMMENTS_NOTE, { date: dateLabel(at, now) });
}

export function codeName(lines: number): string {
  return plural(lines, CODE_ONE, CODE_MANY);
}

export function tableName(columns: number): string {
  return plural(columns, TABLE_ONE, TABLE_MANY);
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

function numbers({ shown, total }: Readonly<Pick<CommentCount, "shown" | "total">>) {
  return { shown: groupedNumber(shown), total: groupedNumber(total) };
}

export function countLabel(counts: Readonly<CommentCount>, place: "row" | "heading"): string {
  return filled(COUNT_TEXTS[counts.filter][place], numbers(counts));
}

export function commentsButtonLabels(counts: Readonly<Pick<CommentCount, "shown" | "total">>) {
  const values = numbers(counts);

  return {
    full: filled(COMMENTS_BUTTON, values),
    short: filled(COMMENTS_BUTTON_SHORT, values),
    count: filled(COMMENTS_BUTTON_COUNT, values),
  };
}

export function scoreLabel(score: number, source: Source): string {
  return source === "x"
    ? filled(LIKES, { count: groupedNumber(score) })
    : plural(score, SCORE_ONE, SCORE_MANY);
}

export function isSameHandle(first: string | null, second: string | null): boolean {
  return first !== null && second !== null && first.toLowerCase() === second.toLowerCase();
}
