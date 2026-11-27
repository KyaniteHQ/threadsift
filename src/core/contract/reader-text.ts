import type { Kind, Source } from "./item-contract.ts";

export const SUMMARY_LABEL = "Summary";
export const KEY_POINTS_LABEL = "Key points";
export const COMMENTS_TITLE = "Comments";
export const HIGHLIGHTS_TITLE = "Highlights";
export const NOTE_TITLE = "Note";
export const UNTITLED = "Untitled";
export const CONTEXT_LABEL = "Not shown";
export const STUB_TEXTS = {
  dropped: "This comment was removed, empty or written by a bot.",
  "not-saved": "The comment being replied to wasn’t saved.",
  "not-kept": "The digest didn’t keep this comment.",
  more: "Further replies weren’t saved.",
} as const;
export const NOT_FOUND = "The item’s text changed and no longer includes this passage.";

export const SECTION_TITLES: Readonly<Record<Kind, string>> = {
  "reddit-post": "Original post",
  "reddit-comment": "Saved comment",
  "x-post": "Original post",
  "github-repo": "README",
  article: "Article",
  link: "Page text",
};

export function handleOf(source: Source, author: string | null): string {
  if (author === null) return "";

  if (source === "reddit") return `u/${author}`;

  return source === "x" ? `@${author}` : author;
}
