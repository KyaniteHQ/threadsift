import type { Item } from "../../src/core/contract/item-wire.ts";
import { whereOf } from "../../src/core/contract/link-place.ts";
import { handleOf } from "../../src/core/contract/reader-text.ts";
import { Icon } from "./Icon.tsx";
import { countLabel } from "./reader-text.ts";
import { SavedTime } from "./SavedTime.tsx";
import { SAVED_COMMENT, SOURCE_LABELS, starsLabel } from "./text.ts";

function commentNote(item: Readonly<Item>): string | null {
  if (item.kind === "reddit-comment") return SAVED_COMMENT;

  const counts = item.commentCount;

  return counts === null ? null : countLabel(counts, "row");
}

function bylineHandle(item: Readonly<Item>): string {
  return item.source === "x" || item.source === "github" ? "" : handleOf(item.source, item.author);
}

export function Byline({ item, now, id }: Readonly<{ item: Item; now: number; id: string }>) {
  const handle = bylineHandle(item);

  return (
    <p id={id} className="it-foot">
      {handle === "" ? null : <bdi dir="auto">{handle}</bdi>}
      <SavedTime savedAt={item.savedAt} now={now} />
      {item.digestTopic === null ? null : <bdi dir="auto">{item.digestTopic}</bdi>}
      {item.stars === null ? null : <span>{starsLabel(item.stars)}</span>}
    </p>
  );
}

function namesSource(item: Readonly<Item>): boolean {
  return item.source !== "reddit" || item.community === null || commentNote(item) === null;
}

export function keptShare(item: Readonly<Item>): number {
  const counts = item.commentCount;

  return counts === null || counts.filter !== "kept" ? 0 : Math.min(counts.shown / counts.total, 1);
}

export function KeptStrip({ item, id }: Readonly<{ item: Item; id: string }>) {
  const note = commentNote(item);

  return (
    <p id={id} className="it-src">
      {item.status === "processing" ? <Icon name="spin" className="ic ic-s proc-ic spin" /> : null}
      {namesSource(item) ? <span>{SOURCE_LABELS[item.source]}</span> : null}
      <span>{whereOf(item)}</span>
      {note === null ? null : <span>{note}</span>}
    </p>
  );
}
