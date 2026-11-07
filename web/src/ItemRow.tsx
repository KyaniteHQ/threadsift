import { type RefObject, memo, useCallback, useEffect, useId, useRef } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import { shownUrl, whereOf } from "../../src/core/links.ts";
import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { ROW_MARK_READ, ROW_MARK_UNREAD } from "./reader-text.ts";
import { revealInPane } from "./reveal.ts";
import { useInternalLink } from "./routing.ts";
import { savedLabel } from "./saved-label.ts";
import {
  CARD_TITLES,
  FAILURE_TITLES,
  NO_DIGEST,
  DIGEST_NOT_UPDATED,
  RETRY_LABEL,
  SOURCE_LABELS,
  starsLabel,
} from "./text.ts";

function showsSkeleton(item: Readonly<Item>): boolean {
  return item.status === "processing" && item.title === null;
}

function rowClasses(item: Readonly<Item>, isOpen: boolean): string {
  return [
    "it",
    ...(item.readState === "unread" ? ["unread"] : []),
    ...(isOpen ? ["open"] : []),
    ...(item.title === null ? ["it-link-only"] : []),
    ...(item.status === "processing" ? ["it-proc"] : []),
  ].join(" ");
}

export type Attention = Readonly<{ id: number; focus: boolean }> | null;

function useAttention(
  row: RefObject<HTMLElement | null>,
  link: RefObject<HTMLAnchorElement | null>,
  attention: Attention,
  attended: () => void,
) {
  useEffect(() => {
    const element = row.current;

    if (attention !== null && element !== null) {
      const reveal = (): void => {
        revealInPane(element);
      };

      reveal();

      if (attention.focus) {
        link.current?.focus({ preventScroll: true });
      }

      void document.fonts.ready.then(reveal);
      attended();
    }
  }, [attended, attention, link, row]);
}

function Failed({
  item,
  describedBy,
  tryAgain,
}: Readonly<{
  item: Exclude<Item, { retry: null }>;
  describedBy: string;
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
          ? FAILURE_TITLES[item.reason]
          : item.digestTitle === null
            ? NO_DIGEST
            : DIGEST_NOT_UPDATED}
      </p>
      <button type="button" className="btn" aria-describedby={describedBy} onClick={retry}>
        {RETRY_LABEL}
      </button>
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

function Foot({ item }: Readonly<{ item: Item }>) {
  if (item.digestTopic === null && item.stars === null) {
    return null;
  }

  return (
    <p className="it-foot">
      {item.digestTopic === null ? null : (
        <bdi className="it-topic" dir="auto">
          {item.digestTopic}
        </bdi>
      )}
      {item.stars === null ? null : <span>{starsLabel(item.stars)}</span>}
    </p>
  );
}

function Status({
  item,
  describedBy,
  tryAgain,
}: Readonly<{ item: Item; describedBy: string; tryAgain: (item: Item) => void }>) {
  if (showsSkeleton(item)) {
    return <Skeleton />;
  }

  return (
    <div className="it-end">
      <Foot item={item} />
      {item.retry === null ? null : (
        <Failed item={item} describedBy={describedBy} tryAgain={tryAgain} />
      )}
    </div>
  );
}

function Meta({ item, now }: Readonly<{ item: Item; now: number }>) {
  return (
    <p className="it-meta">
      {item.status === "processing" ? <Icon name="spin" className="ic ic-s proc-ic spin" /> : null}
      <span className="src">{SOURCE_LABELS[item.source]}</span>
      <span>{whereOf(item)}</span>
      <time className="it-date" dateTime={new Date(item.savedAt).toISOString()}>
        {savedLabel(item.savedAt, now)}
      </time>
    </p>
  );
}

function ReadDot({ item, toggleRead }: Readonly<{ item: Item; toggleRead: (item: Item) => void }>) {
  const toggle = useCallback(() => {
    toggleRead(item);
  }, [item, toggleRead]);

  const label = item.readState === "unread" ? ROW_MARK_READ : ROW_MARK_UNREAD;

  return (
    <button
      type="button"
      className="it-dot"
      aria-label={label}
      title={`${label} (m)`}
      onClick={toggle}
    >
      <i />
    </button>
  );
}

function RowTitle({
  item,
  id,
  link,
  isOpen,
  open,
}: Readonly<{
  item: Item;
  id: string;
  link: RefObject<HTMLAnchorElement | null>;
  isOpen: boolean;
  open: (id: number) => void;
}>) {
  const choose = useInternalLink(
    useCallback(() => {
      open(item.id);
    }, [item.id, open]),
  );

  const title = item.digestTitle ?? item.title;

  return (
    <h2 id={id} className="it-title">
      <a
        ref={link}
        className="it-open"
        href={itemPath(item.id)}
        aria-current={isOpen ? "true" : undefined}
        onClick={choose}
      >
        {title === null ? shownUrl(item.normalizedUrl) : <bdi dir="auto">{title}</bdi>}
      </a>
    </h2>
  );
}

export const ItemRow = memo(function ItemRow({
  item,
  now,
  isOpen,
  attention,
  attended,
  tryAgain,
  open,
  toggleRead,
}: Readonly<{
  item: Item;
  now: number;
  isOpen: boolean;
  attention: Attention;
  attended: () => void;
  tryAgain: (item: Item) => void;
  open: (id: number) => void;
  toggleRead: (item: Item) => void;
}>) {
  const row = useRef<HTMLElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  useAttention(row, link, attention, attended);

  return (
    <article ref={row} className={rowClasses(item, isOpen)} data-key={item.id}>
      <ReadDot item={item} toggleRead={toggleRead} />
      <Meta item={item} now={now} />
      <RowTitle item={item} id={titleId} link={link} isOpen={isOpen} open={open} />
      <Status item={item} describedBy={titleId} tryAgain={tryAgain} />
    </article>
  );
});
