import { memo, useId } from "react";

import type { Entry } from "../../src/core/contract/highlights-page-contract.ts";
import { NOT_FOUND } from "../../src/core/contract/reader-text.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { InternalLink } from "./InternalLink.tsx";
import { type Place, placePath } from "./place.ts";
import { QuoteText } from "./QuoteText.tsx";
import { ageLabel } from "./saved-label.ts";
import { SavedTime } from "./SavedTime.tsx";
import { SOURCE_LABELS } from "./text.ts";

function placeOf(entry: Readonly<Entry>): Place {
  return entry.kind === "highlight" ? { kind: "highlight", id: entry.id } : { kind: "note" };
}

function Passage({ entry, id }: Readonly<{ entry: Entry; id: string }>) {
  return entry.kind === "highlight" ? (
    <blockquote id={id} className="hp-text" dir="auto">
      <QuoteText text={entry.text} />
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
}: Readonly<{ entry: Entry; now: number }>) {
  const textId = useId();
  const goneId = useId();
  const { item } = entry;
  const to = placePath(item.id, placeOf(entry));
  const gone = entry.kind === "highlight" && !entry.found;

  return (
    <li>
      <article className="hp-it" data-kind={entry.kind}>
        <p className="it-meta">
          <span className="src">{SOURCE_LABELS[item.source]}</span>
          <SavedTime savedAt={item.savedAt} now={now} />
        </p>
        <h2 className="hp-title">
          <InternalLink
            className="hp-open"
            to={to}
            aria-describedby={gone ? `${textId} ${goneId}` : textId}
          >
            {item.title === null ? HIGHLIGHTS_PAGE.untitled : <bdi dir="auto">{item.title}</bdi>}
          </InternalLink>
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
