import { Fragment, type RefObject, memo, useCallback, useEffect, useRef } from "react";

import { whereOf } from "../../src/core/links.ts";
import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { failureReasonOf } from "./paste-card.ts";
import { revealInPane } from "./reveal.ts";
import { savedLabel } from "./saved-label.ts";
import { CARD_TITLES, FAILURE_TITLES, NEW_TAB_LABEL, RETRY_LABEL, SOURCE_LABELS } from "./text.ts";

const BREAK_BEFORE_OR_AFTER = /(?<=\/)|(?=[._\-?&=#])/u;

function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//u, "");
}

function BreakableLink({ text }: Readonly<{ text: string }>) {
  const hostEnd = text.search(/[/?#]/u);
  const host = hostEnd === -1 ? text : text.slice(0, hostEnd);
  const parts = text.slice(host.length).split(BREAK_BEFORE_OR_AFTER);
  const offsets = parts.map((_, index) => parts.slice(0, index).join("").length);

  return (
    <>
      {host}
      {parts.map((part, index) => (
        <Fragment key={offsets[index]}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function showsSkeleton(item: Readonly<Item>): boolean {
  return item.status === "processing" && item.title === null;
}

function rowClasses(item: Readonly<Item>, isOpen: boolean, isMarked: boolean): string {
  return [
    "it",
    ...(isOpen ? ["open"] : []),
    ...(isMarked ? ["is-back"] : []),
    ...(item.title === null ? ["it-link-only"] : []),
    ...(showsSkeleton(item) ? ["it-proc"] : []),
    ...(item.status === "failed" ? ["it-failed"] : []),
  ].join(" ");
}

export type Attention = Readonly<{ id: number; focus: boolean }> | null;

function useAttention(
  row: RefObject<HTMLElement | null>,
  link: RefObject<HTMLAnchorElement | null>,
  attention: Attention,
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
    }
  }, [attention, link, row]);
}

function Failed({ item, tryAgain }: Readonly<{ item: Item; tryAgain: (item: Item) => void }>) {
  const retry = useCallback(() => {
    tryAgain(item);
  }, [item, tryAgain]);

  return (
    <div className="it-fail">
      <p>
        <Icon name="warn" className="ic ic-s tone-warn" />
        {FAILURE_TITLES[failureReasonOf(item)]}
      </p>
      <button type="button" className="btn" onClick={retry}>
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
        <i />
      </div>
      <span className="vh">{CARD_TITLES.reading}</span>
    </>
  );
}

function Status({ item, tryAgain }: Readonly<{ item: Item; tryAgain: (item: Item) => void }>) {
  if (showsSkeleton(item)) {
    return <Skeleton />;
  }

  return item.status === "failed" ? <Failed item={item} tryAgain={tryAgain} /> : null;
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
      <Icon name="external" className="ic ic-s" />
    </p>
  );
}

export const ItemRow = memo(function ItemRow({
  item,
  now,
  isOpen,
  isMarked,
  attention,
  tryAgain,
}: Readonly<{
  item: Item;
  now: number;
  isOpen: boolean;
  isMarked: boolean;
  attention: Attention;
  tryAgain: (item: Item) => void;
}>) {
  const row = useRef<HTMLElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useAttention(row, link, attention);

  return (
    <article ref={row} className={rowClasses(item, isOpen, isMarked)} data-key={item.id}>
      <Meta item={item} now={now} />
      <h2 className="it-title">
        <a
          ref={link}
          className="it-open"
          href={item.originalUrl}
          target="_blank"
          rel="noreferrer"
          aria-current={isOpen ? "true" : undefined}
        >
          {item.title === null ? (
            <BreakableLink text={withoutScheme(item.normalizedUrl)} />
          ) : (
            <bdi dir="auto">{item.title}</bdi>
          )}
          <span className="vh">{` ${NEW_TAB_LABEL}`}</span>
        </a>
      </h2>
      <Status item={item} tryAgain={tryAgain} />
    </article>
  );
});
