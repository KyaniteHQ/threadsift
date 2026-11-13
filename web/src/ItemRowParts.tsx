import { useCallback } from "react";

import { whereOf } from "../../src/core/link-place.ts";
import type { Item } from "../../src/http/schemas.ts";
import { commentCountsOf } from "./comment-counts.ts";
import { Icon } from "./Icon.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import { savedLabel } from "./saved-label.ts";
import {
  CARD_TITLES,
  DIGEST_NOT_UPDATED,
  NO_DIGEST,
  RETRY_LABEL,
  SAVED_COMMENT,
  SOURCE_LABELS,
  TOKEN_REFUSED,
  failureTitleOf,
  rowKeptLabel,
  starsLabel,
} from "./text.ts";
import { WaitText } from "./WaitText.tsx";

export type RowIds = Readonly<{
  title: string;
  meta: string;
  foot: string;
  open: string;
  read: string;
  retry: string;
}>;

export function rowIds(base: string): RowIds {
  return {
    title: `${base}-title`,
    meta: `${base}-meta`,
    foot: `${base}-foot`,
    open: `${base}-open`,
    read: `${base}-read`,
    retry: `${base}-retry`,
  };
}

export function controlName(own: string, ids: RowIds): string {
  return [own, ids.title, ids.meta, ids.foot].join(" ");
}

export function linkName(ids: RowIds): string {
  return [ids.open, ids.meta, ids.foot].join(" ");
}

function rejectsToken(item: Readonly<Item>): boolean {
  return item.status === "ready" && item.fetch === "github-token";
}

function showsSkeleton(item: Readonly<Item>): boolean {
  return item.status === "processing" && item.title === null && item.wait === null;
}

function Failed({
  item,
  ids,
  tryAgain,
}: Readonly<{
  item: Exclude<Item, { retry: null }>;
  ids: RowIds;
  tryAgain: (item: Item) => void;
}>) {
  const retry = useCallback(() => {
    tryAgain(item);
  }, [item, tryAgain]);

  return (
    <div className="it-fail">
      <p>
        <Icon name="warn" className="ic ic-s tone-warn" />
        {item.status === "failed"
          ? failureTitleOf(item)
          : item.digestTitle === null
            ? NO_DIGEST
            : DIGEST_NOT_UPDATED}
      </p>
      <button
        type="button"
        id={ids.retry}
        className="btn"
        aria-labelledby={controlName(ids.retry, ids)}
        onClick={retry}
      >
        {RETRY_LABEL}
      </button>
    </div>
  );
}

function TokenRefused() {
  return (
    <div className="it-fail">
      <p>
        <Icon name="warn" className="ic ic-s tone-warn" />
        {TOKEN_REFUSED.row}
      </p>
      <a className="btn" href={SETTINGS_PATH}>
        {TOKEN_REFUSED.link}
      </a>
    </div>
  );
}

function Waiting({ wait }: Readonly<{ wait: NonNullable<Item["wait"]> }>) {
  return (
    <div className="it-fail">
      <p>
        <Icon name="refresh" className="ic ic-s tone-acc" />
        <WaitText wait={wait} />
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="skel" aria-hidden="true">
        <i />
      </div>
      <span className="vh">{CARD_TITLES.reading}</span>
    </>
  );
}

function commentNote(item: Readonly<Item>): string | null {
  if (item.kind === "reddit-comment") return SAVED_COMMENT;

  const counts = commentCountsOf(item);

  return counts === null ? null : rowKeptLabel(counts.kept, counts.total);
}

function Foot({ item, id }: Readonly<{ item: Item; id: string }>) {
  const note = commentNote(item);

  if (item.digestTopic === null && item.stars === null && note === null) {
    return null;
  }

  return (
    <p id={id} className="it-foot">
      {item.digestTopic === null ? null : (
        <bdi className="it-topic" dir="auto">
          {item.digestTopic}
        </bdi>
      )}
      {item.stars === null ? null : <span>{starsLabel(item.stars)}</span>}
      {note === null ? null : <span>{note}</span>}
    </p>
  );
}

export function Status({
  item,
  ids,
  tryAgain,
}: Readonly<{ item: Item; ids: RowIds; tryAgain: (item: Item) => void }>) {
  if (showsSkeleton(item)) {
    return <Skeleton />;
  }

  return (
    <div className="it-end">
      <Foot item={item} id={ids.foot} />
      {rejectsToken(item) ? <TokenRefused /> : null}
      {item.wait === null ? null : <Waiting wait={item.wait} />}
      {item.retry === null ? null : <Failed item={item} ids={ids} tryAgain={tryAgain} />}
    </div>
  );
}

export function Meta({ item, now, id }: Readonly<{ item: Item; now: number; id: string }>) {
  return (
    <p id={id} className="it-meta">
      {item.status === "processing" ? <Icon name="spin" className="ic ic-s proc-ic spin" /> : null}
      <span className="src">{SOURCE_LABELS[item.source]}</span>
      <span>{whereOf(item)}</span>
      <time className="it-date" dateTime={new Date(item.savedAt).toISOString()}>
        {savedLabel(item.savedAt, now)}
      </time>
    </p>
  );
}
