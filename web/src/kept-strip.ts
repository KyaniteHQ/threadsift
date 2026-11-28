import type { CSSProperties } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { whereOf } from "../../src/core/contract/link-place.ts";
import { handleOf } from "../../src/core/contract/reader-text.ts";
import { countLabel } from "./reader-text.ts";
import { SAVED_COMMENT, SOURCE_LABELS } from "./text.ts";

export interface ReaderStrip {
  readonly parts: readonly string[];
  readonly author: string;
}

function commentNote(item: Readonly<Item>): readonly string[] {
  if (item.kind === "reddit-comment") return [SAVED_COMMENT];

  const counts = item.commentCount;

  return counts === null ? [] : [countLabel(counts, "row")];
}

function sourceLabel(item: Readonly<Item>): readonly string[] {
  return item.source !== "reddit" || item.community === null ? [SOURCE_LABELS[item.source]] : [];
}

function stripNamesAuthor(item: Readonly<Item>): boolean {
  return item.kind === "github-repo" || (item.kind === "x-post" && whereOf(item).startsWith("@"));
}

function keptShare(item: Readonly<Item>): number {
  const counts = item.commentCount;

  return counts === null || counts.filter !== "kept" ? 0 : Math.min(counts.shown / counts.total, 1);
}

export function keptBarStyle(item: Readonly<Item>): CSSProperties {
  return Object.fromEntries([["--kept", keptShare(item)]]);
}

export function bylineHandle(item: Readonly<Item>): string {
  return stripNamesAuthor(item) ? "" : handleOf(item.source, item.author);
}

export function stripParts(item: Readonly<Item>): readonly string[] {
  return [...sourceLabel(item), whereOf(item), ...commentNote(item)];
}

export function readerStrip(item: Readonly<Item>): ReaderStrip {
  if (item.source === "x" && item.author !== null)
    return {
      parts: [...sourceLabel(item), ...commentNote(item)],
      author: handleOf(item.source, item.author),
    };

  return { parts: stripParts(item), author: bylineHandle(item) };
}
