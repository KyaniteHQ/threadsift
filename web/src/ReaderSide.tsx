import { type MouseEvent, useCallback, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { HighlightList } from "./HighlightList.tsx";
import { scrollAndFocus } from "./jump-to-comments.ts";
import type { MarginSlot } from "./margin-column.ts";
import { NoteBox } from "./NoteBox.tsx";
import { type ContentsEntry, type SectionIds, contentsOf, postTextOf } from "./reader-sections.ts";
import { CONTENTS_TITLE } from "./reader-text.ts";
import { useSectionInView } from "./use-section-in-view.ts";

function Entry({ entry, current }: Readonly<{ entry: ContentsEntry; current: boolean }>) {
  const { id, title, count } = entry;

  const go = useCallback(
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();

      const heading = document.querySelector(`#${id}`)?.querySelector<HTMLElement>(".rd-h") ?? null;

      if (heading !== null) scrollAndFocus(heading, "start");
    },
    [id],
  );

  return (
    <a
      className="nav-link"
      href={`#${id}`}
      aria-current={current ? "location" : undefined}
      onClick={go}
    >
      {title}
      {count === null ? null : <span className="rd-toc-n">{count}</span>}
    </a>
  );
}

function Contents({ entries }: Readonly<{ entries: readonly ContentsEntry[] }>) {
  const nav = useRef<HTMLElement>(null);
  const heading = useId();
  const ids = useMemo(() => entries.map(({ id }) => id), [entries]);
  const current = useSectionInView(nav, ids, entries.length > 0);

  if (entries.length === 0) return null;

  return (
    <nav ref={nav} className="rd-toc" aria-labelledby={heading}>
      <h3 id={heading} className="rd-h">
        {CONTENTS_TITLE}
      </h3>
      <ul role="list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Entry entry={entry} current={entry.id === current} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ReaderSide({
  margin,
  item,
  detail,
  ids,
}: Readonly<{ margin: MarginSlot; item: Item; detail: ItemDetail; ids: SectionIds }>) {
  const contents = useMemo(() => contentsOf(item, detail, ids), [item, detail, ids]);
  const selectable = postTextOf(detail) !== null || detail.comments.nodes.length > 0;

  return margin.node === null
    ? null
    : createPortal(
        <>
          {margin.beside ? <Contents entries={contents} /> : null}
          <HighlightList selectable={selectable} />
          <NoteBox key={item.id} itemId={item.id} initial={detail.note} />
        </>,
        margin.node,
      );
}
