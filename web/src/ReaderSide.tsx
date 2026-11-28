import { type MouseEvent, useCallback, useId, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { NOTHING } from "../../src/core/contract/nothing.ts";
import { HighlightList } from "./HighlightList.tsx";
import { scrollAndFocus } from "./jump-to-comments.ts";
import { NoteBox } from "./NoteBox.tsx";
import {
  type ContentsEntry,
  type SectionIds,
  contentsOf,
  holdsSelectableText,
} from "./reader-sections.ts";
import { CONTENTS_TITLE } from "./reader-text.ts";
import type { SideSlot } from "./side-column.ts";
import { useSectionInView } from "./use-section-in-view.ts";

function Entry({ entry, current }: Readonly<{ entry: ContentsEntry; current: boolean }>) {
  const { id, title, count } = entry;

  const go = useCallback(
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();

      const heading = document.querySelector<HTMLElement>(`#${CSS.escape(id)} .rd-h`);

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

function useCommentsListed(
  entries: readonly ContentsEntry[],
  commentsId: string,
  listComments: (listed: boolean) => void,
): void {
  const listed = entries.some(({ id }) => id === commentsId);

  useLayoutEffect(() => {
    if (!listed) return NOTHING;

    listComments(true);

    return () => {
      listComments(false);
    };
  }, [listed, listComments]);
}

function Contents({
  entries,
  commentsId,
  listComments,
}: Readonly<{
  entries: readonly ContentsEntry[];
  commentsId: string;
  listComments: (listed: boolean) => void;
}>) {
  const nav = useRef<HTMLElement>(null);
  const heading = useId();
  const ids = useMemo(() => entries.map(({ id }) => id), [entries]);
  const current = useSectionInView(nav, ids, entries.length > 0);

  useCommentsListed(entries, commentsId, listComments);

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
  side,
  item,
  detail,
  ids,
}: Readonly<{ side: SideSlot; item: Item; detail: ItemDetail; ids: SectionIds }>) {
  const contents = useMemo(() => contentsOf(item, detail, ids), [item, detail, ids]);

  return side.node === null
    ? null
    : createPortal(
        <>
          {side.beside ? (
            <Contents
              entries={contents}
              commentsId={ids.comments}
              listComments={side.listComments}
            />
          ) : null}
          <HighlightList selectable={holdsSelectableText(detail)} />
          <NoteBox key={item.id} itemId={item.id} initial={detail.note} />
        </>,
        side.node,
      );
}
