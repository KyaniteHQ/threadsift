import { type RefObject, useEffect, useRef } from "react";

import { whereOf } from "../../src/core/links.ts";
import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { revealInPane } from "./reveal.ts";
import { savedLabel } from "./saved-label.ts";
import { NEW_TAB_LABEL, SOURCE_LABELS } from "./text.ts";

function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//u, "");
}

function useAttention(
  row: RefObject<HTMLElement | null>,
  link: RefObject<HTMLAnchorElement | null>,
  attention: Readonly<{ id: number }> | null,
) {
  useEffect(() => {
    const element = row.current;

    if (attention !== null && element !== null) {
      const reveal = (): void => {
        revealInPane(element);
      };

      reveal();
      link.current?.focus({ preventScroll: true });
      void document.fonts.ready.then(reveal);
    }
  }, [attention, link, row]);
}

export function ItemRow({
  item,
  now,
  isOpen,
  attention,
}: Readonly<{
  item: Item;
  now: number;
  isOpen: boolean;
  attention: Readonly<{ id: number }> | null;
}>) {
  const row = useRef<HTMLElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useAttention(row, link, attention);

  return (
    <article ref={row} className={isOpen ? "it open" : "it"} data-key={item.id}>
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
          {withoutScheme(item.normalizedUrl)}
          <span className="vh">{` ${NEW_TAB_LABEL}`}</span>
        </a>
      </h2>
    </article>
  );
}
