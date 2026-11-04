import { useEffect, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { revealInPane } from "./reveal.ts";
import { savedLabel } from "./saved-label.ts";
import { SOURCE_LABELS } from "./text.ts";

function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//u, "");
}

export function ItemRow({
  item,
  now,
  isOpen,
}: Readonly<{ item: Item; now: number; isOpen: boolean }>) {
  const row = useRef<HTMLElement>(null);
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const element = row.current;

    if (isOpen && element !== null) {
      const reveal = (): void => {
        revealInPane(element);
      };

      reveal();
      link.current?.focus({ preventScroll: true });
      void document.fonts.ready.then(reveal);
    }
  }, [isOpen]);

  return (
    <article ref={row} className={isOpen ? "it open" : "it"} data-key={item.id}>
      <p className="it-meta">
        <span className="src">{SOURCE_LABELS[item.source]}</span>
        <time className="it-date" dateTime={new Date(item.savedAt).toISOString()}>
          {savedLabel(item.savedAt, now)}
        </time>
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
        </a>
      </h2>
    </article>
  );
}
