import { useEffect, useRef } from "react";

import { shownUrl, whereOf } from "../../src/core/link-place.ts";
import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { keyed } from "./keyed.ts";
import {
  DIGEST_PENDING,
  KEY_POINTS_LABEL,
  READER_LOADING,
  SUMMARY_LABEL,
  handleOf,
  postedLabel,
} from "./reader-text.ts";
import { HeadNote, Note } from "./ReaderNote.tsx";
import { savedLabel } from "./saved-label.ts";
import { tagHue } from "./tag-hue.ts";
import { DIGEST_NOT_UPDATED, NO_DIGEST, SOURCE_LABELS } from "./text.ts";
import { TopicLink } from "./TopicLink.tsx";

export function ReaderHead({
  item,
  detail,
  now,
  titleId,
  focusTitle,
  loading,
  tryAgain,
}: Readonly<{
  item: Item;
  detail: ItemDetail | null;
  now: number;
  titleId: string;
  focusTitle: boolean;
  loading: boolean;
  tryAgain: (item: Item) => void;
}>) {
  const title = useRef<HTMLHeadingElement>(null);
  const name = item.digestTitle ?? item.title;

  useEffect(() => {
    if (focusTitle && !loading) title.current?.focus({ preventScroll: true });
  }, [focusTitle, loading]);

  return (
    <header className="rd-head" inert={loading}>
      <p className="rd-src">
        <span className="src">{SOURCE_LABELS[item.source]}</span>
        {item.source === "x" && item.author !== null ? null : <span>{whereOf(item)}</span>}
        <span>{handleOf(item.source, item.author)}</span>
        <span>
          {detail === null || detail.postedAt === null ? "" : postedLabel(detail.postedAt, now)}
        </span>
        <span>{savedLabel(item.savedAt, now)}</span>
      </p>
      <h2 ref={title} id={titleId} className="rd-title" tabIndex={-1}>
        <bdi dir="auto">{name ?? shownUrl(item.normalizedUrl)}</bdi>
      </h2>
      <HeadNote item={item} tryAgain={tryAgain} />
    </header>
  );
}

function Summary({
  item,
  digest,
}: Readonly<{ item: Item; digest: NonNullable<ItemDetail["digest"]> }>) {
  return (
    <aside className="rd-agent" aria-label={SUMMARY_LABEL}>
      <p className="rd-filed">
        {item.digestTopic === null ? null : <TopicLink name={item.digestTopic} />}
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

export function Agent({
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

export function ReaderLoading() {
  return <output className="rd-note rd-loading">{READER_LOADING}</output>;
}
