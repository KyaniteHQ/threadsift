import { useId, useMemo } from "react";

import type { CommentCount, CommentsFilter } from "../../src/core/contract/comment-view.ts";
import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import {
  COMMENTS_TITLE,
  SECTION_TITLES,
  SUMMARY_LABEL,
} from "../../src/core/contract/reader-text.ts";
import {
  ALL_REMOVED,
  NONE_KEPT,
  RELATED,
  UNFILTERED_NOTES,
  commentsButtonLabels,
} from "./reader-text.ts";

export interface SectionIds {
  readonly summary: string;
  readonly post: string;
  readonly related: string;
  readonly comments: string;
}

export interface ContentsEntry {
  readonly id: string;
  readonly title: string;
  readonly count: string | null;
}

export interface CommentsSection {
  readonly counts: CommentCount | null;
  readonly note: string | null;
  readonly needsProvider: boolean;
}

export function commentsSectionOf(view: Readonly<CommentsFilter>): CommentsSection | null {
  switch (view.filter) {
    case "absent":
      return null;
    case "removed":
      return { counts: null, note: ALL_REMOVED, needsProvider: false };
    case "unfiltered":
      return {
        counts: view.count,
        note: UNFILTERED_NOTES[view.cause],
        needsProvider: view.cause === "no-provider",
      };
    case "kept":
      return { counts: view.count, note: null, needsProvider: false };
    case "nothing-kept":
      return { counts: view.count, note: NONE_KEPT, needsProvider: false };
    default: {
      const exhaustive: never = view;

      return exhaustive;
    }
  }
}

export function useSectionIds(): SectionIds {
  const base = useId();

  return useMemo(
    () => ({
      summary: `${base}summary`,
      post: `${base}post`,
      related: `${base}related`,
      comments: `${base}comments`,
    }),
    [base],
  );
}

export function postTextOf(detail: Readonly<ItemDetail>): string | null {
  return detail.postText === null || detail.postText.trim() === "" ? null : detail.postText;
}

export function holdsSelectableText(detail: Readonly<ItemDetail>): boolean {
  return (
    postTextOf(detail) !== null || detail.comments.nodes.some(({ kind }) => kind === "comment")
  );
}

function commentsEntry(detail: Readonly<ItemDetail>, ids: SectionIds): readonly ContentsEntry[] {
  const section = commentsSectionOf(detail.comments.view);

  if (section === null) return [];

  const count = section.counts === null ? null : commentsButtonLabels(section.counts).short;

  return [{ id: ids.comments, title: COMMENTS_TITLE, count }];
}

export function contentsOf(
  item: Readonly<Item>,
  detail: Readonly<ItemDetail>,
  ids: SectionIds,
): readonly ContentsEntry[] {
  return [
    detail.digest === null ? [] : [{ id: ids.summary, title: SUMMARY_LABEL, count: null }],
    postTextOf(detail) === null
      ? []
      : [{ id: ids.post, title: SECTION_TITLES[item.kind], count: null }],
    detail.related.length === 0 ? [] : [{ id: ids.related, title: RELATED.title, count: null }],
    commentsEntry(detail, ids),
  ].flat();
}
