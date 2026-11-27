import { useEffect, useRef } from "react";

import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { shownUrl, whereOf } from "../../src/core/contract/link-place.ts";
import { handleOf } from "../../src/core/contract/reader-text.ts";
import { DIGEST_PENDING, READER_LOADING, postedLabel } from "./reader-text.ts";
import { HeadNote, Note } from "./ReaderNote.tsx";
import { ReaderSummary } from "./ReaderSummary.tsx";
import { savedLabel } from "./saved-label.ts";
import { DIGEST_UPDATE_FAILED, DIGEST_FAILED, SOURCE_LABELS } from "./text.ts";

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

  return (
    <>
      {detail.digest === null ? null : <ReaderSummary item={item} digest={detail.digest} />}
      {note === null ? null : (
        <Note item={item} text={note} withRetry={item.retry !== null} tryAgain={tryAgain} />
      )}
    </>
  );
}

export function ReaderLoading() {
  return <output className="rd-note rd-loading">{READER_LOADING}</output>;
}
