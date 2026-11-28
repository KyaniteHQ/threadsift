import { useId, useMemo } from "react";

import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import {
  COMMENTS_TITLE,
  SECTION_TITLES,
  SUMMARY_LABEL,
} from "../../src/core/contract/reader-text.ts";
import { hasComments } from "./Comments.tsx";
import { RELATED, commentsButtonLabels } from "./reader-text.ts";

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

function commentsCount(item: Readonly<Item>): string | null {
  const counts = item.commentCount;

  return counts === null || counts.shown === 0 ? null : commentsButtonLabels(counts).short;
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
    hasComments(detail)
      ? [{ id: ids.comments, title: COMMENTS_TITLE, count: commentsCount(item) }]
      : [],
  ].flat();
}
