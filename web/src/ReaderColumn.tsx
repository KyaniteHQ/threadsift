import { useEffect, useRef } from "react";

import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { shownUrl } from "../../src/core/contract/link-place.ts";
import { SUMMARY_LABEL } from "../../src/core/contract/reader-text.ts";
import { bylineHandle, keptBarStyle, stripParts } from "./ItemRowLines.tsx";
import { keyed } from "./keyed.ts";
import { DIGEST_PENDING, READER_LOADING, postedLabel } from "./reader-text.ts";
import { HeadNote, Note } from "./ReaderNote.tsx";
import { ReaderFiled, ReaderSummary } from "./ReaderSummary.tsx";
import { savedLabel } from "./saved-label.ts";
import { DIGEST_UPDATE_FAILED, DIGEST_FAILED } from "./text.ts";

function ReaderMeta({
  item,
  postedAt,
  now,
}: Readonly<{ item: Item; postedAt: number | null; now: number }>) {
  const handle = bylineHandle(item);

  return (
    <p className="rd-meta">
      <i
        className={item.readState === "unread" ? "rd-mark unread" : "rd-mark"}
        aria-hidden="true"
      />
      {keyed(stripParts(item)).map(({ key, text }) => (
        <span key={key} className="rd-part rd-st">
          {text}
        </span>
      ))}
      {handle === "" ? null : (
        <bdi className="rd-part" dir="auto">
          {handle}
        </bdi>
      )}
      {postedAt === null ? null : <span className="rd-part">{postedLabel(postedAt, now)}</span>}
      <span className="rd-part">{savedLabel(item.savedAt, now)}</span>
    </p>
  );
}

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
  const link = detail?.link ?? null;

  useEffect(() => {
    if (focusTitle && !loading) title.current?.focus({ preventScroll: true });
  }, [focusTitle, loading]);

  return (
    <header className="rd-head" inert={loading}>
      <i className="rd-share" style={keptBarStyle(item)} aria-hidden="true" />
      <h2 ref={title} id={titleId} className="rd-title" tabIndex={-1}>
        <bdi dir="auto">{name ?? shownUrl(item.normalizedUrl)}</bdi>
      </h2>
      <ReaderMeta item={item} postedAt={detail?.postedAt ?? null} now={now} />
      <ReaderFiled topic={item.digestTopic} digest={detail?.digest ?? null} />
      {link === null ? null : (
        <a className="rd-link" href={link} target="_blank" rel="noopener noreferrer">
          {link}
        </a>
      )}
      <HeadNote item={item} tryAgain={tryAgain} />
    </header>
  );
}

function digestNote(item: Readonly<Item>, hasDigest: boolean): string | null {
  if (item.digestOutcome === "pending") return DIGEST_PENDING;

  if (item.digestOutcome === "failed") return hasDigest ? DIGEST_UPDATE_FAILED : DIGEST_FAILED;

  return null;
}

export function Agent({
  item,
  detail,
  tryAgain,
}: Readonly<{ item: Item; detail: ItemDetail; tryAgain: (item: Item) => void }>) {
  const note = digestNote(item, detail.digest !== null);

  if (detail.digest === null && note === DIGEST_PENDING && item.retry === null)
    return <DigestWait />;

  return (
    <>
      {detail.digest === null ? null : <ReaderSummary digest={detail.digest} />}
      {note === null ? null : (
        <Note item={item} text={note} withRetry={item.retry !== null} tryAgain={tryAgain} />
      )}
    </>
  );
}

function DigestWait() {
  return (
    <div className="rd-wait">
      <p className="label">{SUMMARY_LABEL}</p>
      <p className="rd-note">{DIGEST_PENDING}</p>
      <i className="rd-wait-line" aria-hidden="true" />
    </div>
  );
}

export function ReaderLoading() {
  return <output className="rd-note rd-loading">{READER_LOADING}</output>;
}
