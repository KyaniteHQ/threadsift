import type { Item } from "../../src/core/contract/item-wire.ts";
import { HighlightsProvider } from "./Highlights.tsx";
import { NoteBox } from "./NoteBox.tsx";
import { READER_FAILED, READER_STALE } from "./reader-text.ts";
import { Agent } from "./ReaderColumn.tsx";
import { Original } from "./ReaderOriginal.tsx";
import { RETRY_LABEL } from "./text.ts";
import type { DetailActions, DetailState } from "./use-item-detail.ts";

export function ReaderNotices({
  state,
  retry,
}: Readonly<{ state: DetailState; retry: () => void }>) {
  return (
    <>
      <div className="rd-orig" role="alert">
        {state.status === "failed" ? (
          <>
            <p className="rd-note">{READER_FAILED}</p>
            <button type="button" className="btn btn-block" onClick={retry}>
              {RETRY_LABEL}
            </button>
          </>
        ) : null}
      </div>
      <output className="rd-orig">
        {state.status === "ready" && state.stale ? (
          <>
            <span className="rd-note">{READER_STALE}</span>
            <button type="button" className="btn btn-block" onClick={retry}>
              {RETRY_LABEL}
            </button>
          </>
        ) : null}
      </output>
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
}: Readonly<{
  item: Item;
  state: Extract<DetailState, { status: "ready" }>;
  actions: DetailActions;
  announce: (text: string) => void;
  tryAgain: (item: Item) => void;
  now: number;
}>) {
  return (
    <>
      <HighlightsProvider
        itemId={item.id}
        view={state.detail.highlights}
        actions={actions}
        announce={announce}
      >
        <Agent item={item} detail={state.detail} tryAgain={tryAgain} />
        <Original item={item} detail={state.detail} now={now} />
      </HighlightsProvider>
      <NoteBox key={item.id} itemId={item.id} initial={state.detail.note} />
    </>
  );
}
