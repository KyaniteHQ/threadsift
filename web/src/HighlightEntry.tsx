import { type ReactNode, memo, useCallback, useId } from "react";

import type { Entry } from "../../src/core/highlights-page-contract.ts";
import { STORED_PICTURE_TEXT } from "../../src/core/reader-url.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { Icon } from "./Icon.tsx";
import { type Place, placePath } from "./place.ts";
import { NOT_FOUND } from "./reader-text.ts";
import { useInternalLink } from "./routing.ts";
import { ageLabel, savedLabel } from "./saved-label.ts";
import { SOURCE_LABELS } from "./text.ts";

function placeOf(entry: Readonly<Entry>): Place {
  return entry.kind === "highlight" ? { kind: "highlight", id: entry.id } : { kind: "note" };
}

function Picture() {
  return (
    <span className="hp-pic">
      <Icon name="picture" className="ic ic-s" label={HIGHLIGHTS_PAGE.picture} />
    </span>
  );
}

function quoteOf(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let offset = 0;

  for (const words of text.split(STORED_PICTURE_TEXT)) {
    if (offset > 0) nodes.push(<Picture key={offset} />);

    nodes.push(words);
    offset += words.length + 1;
  }

  return nodes;
}

function Passage({ entry, id }: Readonly<{ entry: Entry; id: string }>) {
  return entry.kind === "highlight" ? (
    <blockquote id={id} className="hp-text" dir="auto">
      {quoteOf(entry.text)}
    </blockquote>
  ) : (
    <p id={id} className="hp-text" dir="auto">
      {entry.text}
    </p>
  );
}

function Kind({ entry, now }: Readonly<{ entry: Entry; now: number }>) {
  return (
    <p className="hp-kind">
      <span className="label">
        {entry.kind === "highlight" ? HIGHLIGHTS_PAGE.kindHighlight : HIGHLIGHTS_PAGE.kindNote}
      </span>
      <time dateTime={new Date(entry.date).toISOString()}>{ageLabel(entry.date, now)}</time>
    </p>
  );
}

export const HighlightEntry = memo(function HighlightEntry({
  entry,
  now,
  navigate,
}: Readonly<{ entry: Entry; now: number; navigate: (to: string) => void }>) {
  const textId = useId();
  const goneId = useId();
  const { item } = entry;
  const to = placePath(item.id, placeOf(entry));
  const gone = entry.kind === "highlight" && !entry.found;

  const open = useInternalLink(
    useCallback(() => {
      navigate(to);
    }, [navigate, to]),
  );

  return (
    <li>
      <article className="hp-it" data-kind={entry.kind}>
        <p className="it-meta">
          <span className="src">{SOURCE_LABELS[item.source]}</span>
          <time className="it-date" dateTime={new Date(item.savedAt).toISOString()}>
            {savedLabel(item.savedAt, now)}
          </time>
        </p>
        <h2 className="hp-title">
          <a
            className="hp-open"
            href={to}
            aria-describedby={gone ? `${textId} ${goneId}` : textId}
            onClick={open}
          >
            {item.title === null ? HIGHLIGHTS_PAGE.untitled : <bdi dir="auto">{item.title}</bdi>}
          </a>
        </h2>
        <Kind entry={entry} now={now} />
        <Passage entry={entry} id={textId} />
        {gone ? (
          <p id={goneId} className="rd-note hp-gone">
            {NOT_FOUND}
          </p>
        ) : null}
      </article>
    </li>
  );
});
