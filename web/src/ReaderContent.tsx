import { createPortal } from "react-dom";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { HighlightList } from "./HighlightList.tsx";
import { HighlightsProvider } from "./Highlights.tsx";
import type { MarginSlot } from "./margin-column.ts";
import { NoteBox } from "./NoteBox.tsx";
import { READER_FAILED, READER_STALE } from "./reader-text.ts";
import { Agent } from "./ReaderColumn.tsx";
import { Original } from "./ReaderOriginal.tsx";
import { Related } from "./Related.tsx";
import { AlertRegion, StatusRegion } from "./RetryRegions.tsx";
import type { DetailActions, DetailState } from "./use-item-detail.ts";

export function ReaderNotices({
  state,
  retry,
}: Readonly<{ state: DetailState; retry: () => void }>) {
  return (
    <>
      <AlertRegion
        className="rd-orig"
        buttonClass="btn btn-block"
        text={state.status === "failed" ? READER_FAILED : null}
        retry={retry}
      />
      <StatusRegion
        className="rd-orig"
        buttonClass="btn btn-block"
        text={state.status === "ready" && state.stale ? READER_STALE : null}
        retry={retry}
      />
    </>
  );
}

export function ReaderContent({
  item,
  state,
  actions,
  announce,
  tryAgain,
  now,
  margin,
}: Readonly<{
  item: Item;
  state: Extract<DetailState, { status: "ready" }>;
  actions: DetailActions;
  announce: (text: string) => void;
  tryAgain: (item: Item) => void;
  now: number;
  margin: MarginSlot;
}>) {
  const agent = <Agent item={item} detail={state.detail} tryAgain={tryAgain} />;

  return (
    <HighlightsProvider
      itemId={item.id}
      view={state.detail.highlights}
      actions={actions}
      announce={announce}
    >
      {margin.beside ? null : agent}
      <Original item={item} detail={state.detail} now={now} />
      {margin.node === null
        ? null
        : createPortal(
            <>
              {margin.beside ? agent : null}
              <Related entries={state.detail.related} />
              <HighlightList />
              <NoteBox key={item.id} itemId={item.id} initial={state.detail.note} />
            </>,
            margin.node,
          )}
    </HighlightsProvider>
  );
}
