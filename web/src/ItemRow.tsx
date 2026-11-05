import { Fragment, type RefObject, memo, useEffect, useRef } from "react";

import { whereOf } from "../../src/core/links.ts";
import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { revealInPane } from "./reveal.ts";
import { savedLabel } from "./saved-label.ts";
import { NEW_TAB_LABEL, SOURCE_LABELS } from "./text.ts";

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

function rowClasses(isOpen: boolean, title: string | null): string {
  return ["it", ...(isOpen ? ["open"] : []), ...(title === null ? ["it-link-only"] : [])].join(" ");
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

export const ItemRow = memo(function ItemRow({
  item,
  now,
  isOpen,
  attention,
}: Readonly<{
  item: Item;
  now: number;
  isOpen: boolean;
  attention: Attention;
}>) {
  const row = useRef<HTMLElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useAttention(row, link, attention);

  return (
    <article ref={row} className={rowClasses(isOpen, item.title)} data-key={item.id}>
      <p className="it-meta">
        <span className="src">{SOURCE_LABELS[item.source]}</span>
        <span>{whereOf(item)}</span>
        <time className="it-date" dateTime={new Date(item.savedAt).toISOString()}>
          {savedLabel(item.savedAt, now)}
        </time>
        <Icon name="external" className="ic ic-s" />
      </p>
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
    </article>
  );
});
