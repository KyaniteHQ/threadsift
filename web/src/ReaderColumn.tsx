import { use, useEffect, useRef } from "react";

import { whereOf } from "../../src/core/links.ts";
import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { noteOf } from "./paste-card.ts";
import { postTextModule } from "./post-text-module.ts";
import {
  DIGEST_PENDING,
  KEY_POINTS_LABEL,
  NO_POST_TEXT,
  READER_FAILED,
  READER_LOADING,
  SECTION_TITLES,
  SUMMARY_LABEL,
  postedLabel,
} from "./reader-text.ts";
import { savedLabel } from "./saved-label.ts";
import { tagHue } from "./tag-hue.ts";
import {
  CARD_TITLES,
  DIGEST_NOT_UPDATED,
  FAILURE_TITLES,
  NOTICES,
  NO_DIGEST,
  RETRY_LABEL,
  SOURCE_LABELS,
} from "./text.ts";
import type { DetailState } from "./use-item-detail.ts";

function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//u, "");
}

function bylineOf(item: Readonly<Item>): string {
  if (item.author === null) return "";

  if (item.source === "reddit") return `u/${item.author}`;

  return item.source === "x" ? `@${item.author}` : item.author;
}

function noteTextOf(item: Readonly<Item>): string | null {
  if (item.status === "failed") return FAILURE_TITLES[item.reason];

  const key = noteOf(item);

  return key === null ? null : NOTICES[key].text;
}

function Head({
  item,
  detail,
  now,
  titleId,
  focusTitle,
}: Readonly<{
  item: Item;
  detail: ItemDetail | null;
  now: number;
  titleId: string;
  focusTitle: boolean;
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
        <bdi dir="auto">{name ?? withoutScheme(item.normalizedUrl)}</bdi>
      </h2>
      {note === null ? null : <p className="rd-note">{note}</p>}
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

function Agent({ item, detail }: Readonly<{ item: Item; detail: ItemDetail }>) {
  const note = digestNote(item, detail.digest !== null);

  return (
    <>
      {detail.digest === null ? null : <Summary item={item} digest={detail.digest} />}
      {note === null ? null : <p className="rd-note">{note}</p>}
    </>
  );
}

function Original({ item, detail }: Readonly<{ item: Item; detail: ItemDetail }>) {
  const { PostText } = use(postTextModule);
  const text = detail.postText;

  if (text === null || text.trim() === "") {
    return item.status === "processing" ? (
      <p className="rd-note">{CARD_TITLES.reading}</p>
    ) : (
      <p className="rd-note">{NO_POST_TEXT}</p>
    );
  }

  return (
    <section className="rd-orig">
      <h3 className="rd-h">{SECTION_TITLES[item.kind]}</h3>
      <PostText text={text} />
    </section>
  );
}

function Body({
  item,
  state,
  retry,
}: Readonly<{ item: Item; state: DetailState; retry: () => void }>) {
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
      <Agent item={item} detail={state.detail} />
      <Original item={item} detail={state.detail} />
    </>
  );
}

export function ReaderColumn({
  item,
  state,
  retry,
  now,
  titleId,
  focusTitle,
}: Readonly<{
  item: Item;
  state: DetailState;
  retry: () => void;
  now: number;
  titleId: string;
  focusTitle: boolean;
}>) {
  return (
    <div className="rd-col">
      <Head
        item={item}
        detail={state.status === "ready" ? state.detail : null}
        now={now}
        titleId={titleId}
        focusTitle={focusTitle}
      />
      <Body item={item} state={state} retry={retry} />
    </div>
  );
}
