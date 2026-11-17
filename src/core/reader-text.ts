import type { Kind, Source } from "./kinds.ts";

export const SUMMARY_LABEL = "Summary";
export const KEY_POINTS_LABEL = "Key points";
export const COMMENTS_TITLE = "Comments";
export const HIGHLIGHTS_TITLE = "Highlights";
export const NOTE_TITLE = "Note";
export const UNTITLED = "Untitled";
export const CONTEXT_LABEL = "Context";
export const STUB_TEXTS = {
  dropped: "Removed comment shown so the replies below make sense.",
  "not-saved": "The parent post was not saved.",
  "not-kept": "Comment not kept, shown so the replies below make sense.",
  more: "Further replies were not saved.",
} as const;
export const NOT_FOUND = "Passage no longer found because the item’s text changed.";

export const SECTION_TITLES: Readonly<Record<Kind, string>> = {
  "reddit-post": "Original post",
  "reddit-comment": "Original post",
  "x-post": "Original post",
  "github-repo": "README",
  article: "Article",
  link: "Original post",
};

export function handleOf(source: Source, author: string | null): string {
  if (author === null) return "";

  if (source === "reddit") return `u/${author}`;

  return source === "x" ? `@${author}` : author;
}
