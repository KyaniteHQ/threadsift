import { useCallback, useEffect, useRef } from "react";

import { shownUrl, whereOf } from "../../src/core/links.ts";
import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { noteOf } from "./paste-card.ts";
import {
  DIGEST_PENDING,
  KEY_POINTS_LABEL,
  READER_FAILED,
  READER_LOADING,
  SUMMARY_LABEL,
  postedLabel,
} from "./reader-text.ts";
import { Original } from "./ReaderOriginal.tsx";
import { savedLabel } from "./saved-label.ts";
import { tagHue } from "./tag-hue.ts";
import {
  DIGEST_NOT_UPDATED,
  FAILURE_TITLES,
  NOTICES,
  NO_DIGEST,
  RETRY_LABEL,
  SOURCE_LABELS,
} from "./text.ts";
import type { DetailState } from "./use-item-detail.ts";

function bylineOf(item: Readonly<Item>): string {
  if (item.author === null) return "";

  if (item.source === "reddit") return `u/${item.author}`;

  return item.source === "x" ? `@${item.author}` : item.author;
}

function noteTextOf(item: Readonly<Item>): string | null {
  if (item.status === "failed") return FAILURE_TITLES[item.reason];

  if (item.fetch === "github-token") return null;

  const key = noteOf(item);

  return key === null ? null : NOTICES[key].text;
}

function Note({
  item,
  text,
  withRetry,
  tryAgain,
}: Readonly<{ item: Item; text: string; withRetry: boolean; tryAgain: (item: Item) => void }>) {
  const retry = useCallback(() => {
    tryAgain(item);
  }, [item, tryAgain]);

  if (!withRetry) return <p className="rd-note">{text}</p>;

  return (
    <div className="rd-orig">
      <p className="rd-note">{text}</p>
      <button type="button" className="btn btn-block" onClick={retry}>
        {RETRY_LABEL}
      </button>
    </div>
  );
}

export function ReaderHead({
  item,
  detail,
  now,
  titleId,
  focusTitle,
  tryAgain,
}: Readonly<{
  item: Item;
  detail: ItemDetail | null;
  now: number;
  titleId: string;
  focusTitle: boolean;
  tryAgain: (item: Item) => void;
}>) {
  const title = useRef<HTMLHeadingElement>(null);
  const note = noteTextOf(item);
  const name = item.digestTitle ?? item.title;

  useEffect(() => {
    if (focusTitle) title.current?.focus({ preventScroll: true });
  }, [focusTitle]);

  return (
    <header className="rd-head">
      <p className="rd-src">
        <span className="src">{SOURCE_LABELS[item.source]}</span>
        <span>{whereOf(item)}</span>
        <span>{bylineOf(item)}</span>
        <span>
          {detail === null || detail.postedAt === null ? "" : postedLabel(detail.postedAt, now)}
        </span>
        <span>{savedLabel(item.savedAt, now)}</span>
      </p>
      <h2 ref={title} id={titleId} className="rd-title" tabIndex={-1}>
        <bdi dir="auto">{name ?? shownUrl(item.normalizedUrl)}</bdi>
      </h2>
      {note === null ? null : (
        <Note item={item} text={note} withRetry={item.status === "failed"} tryAgain={tryAgain} />
      )}
    </header>
  );
}

function keyed(texts: readonly string[]): readonly { key: string; text: string }[] {
  const seen = new Map<string, number>();

  return texts.map((text) => {
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);

    return { key: `${text}#${count}`, text };
  });
}

function Summary({
  item,
  digest,
}: Readonly<{ item: Item; digest: NonNullable<ItemDetail["digest"]> }>) {
  return (
    <aside className="rd-agent" aria-label={SUMMARY_LABEL}>
      <p className="rd-filed">
        {item.digestTopic === null ? null : <span className="rd-topic">{item.digestTopic}</span>}
        <span className="tags">
          {keyed(digest.tags).map(({ key, text }) => (
            <span key={key} className="tag" data-tag={tagHue(text)}>
              <i className="tag-dot" />
              {text}
            </span>
          ))}
        </span>
      </p>
      <p className="rd-summary">{digest.summary}</p>
      <h3 className="label">{KEY_POINTS_LABEL}</h3>
      <ul className="rd-points">
        {keyed(digest.keyPoints).map(({ key, text }) => (
          <li key={key}>{text}</li>
        ))}
      </ul>
    </aside>
  );
}

function digestNote(item: Readonly<Item>, hasDigest: boolean): string | null {
  if (item.digestOutcome === "pending") return DIGEST_PENDING;

  if (item.digestOutcome === "failed") return hasDigest ? DIGEST_NOT_UPDATED : NO_DIGEST;

  return null;
}

function Agent({
  item,
  detail,
  tryAgain,
}: Readonly<{ item: Item; detail: ItemDetail; tryAgain: (item: Item) => void }>) {
  const note = digestNote(item, detail.digest !== null);

  return (
    <>
      {detail.digest === null ? null : <Summary item={item} digest={detail.digest} />}
      {note === null ? null : (
        <Note item={item} text={note} withRetry={item.retry !== null} tryAgain={tryAgain} />
      )}
    </>
  );
}

export function ReaderContent({
  item,
  state,
  retry,
  tryAgain,
  now,
}: Readonly<{
  item: Item;
  state: DetailState;
  retry: () => void;
  tryAgain: (item: Item) => void;
  now: number;
}>) {
  if (state.status === "loading") {
    return <output className="rd-note">{READER_LOADING}</output>;
  }

  if (state.status === "failed") {
    return (
      <div className="rd-orig" role="alert">
        <p className="rd-note">{READER_FAILED}</p>
        <button type="button" className="btn btn-block" onClick={retry}>
          {RETRY_LABEL}
        </button>
      </div>
    );
  }

  return (
    <>
      <Agent item={item} detail={state.detail} tryAgain={tryAgain} />
      <Original item={item} detail={state.detail} now={now} />
    </>
  );
}
