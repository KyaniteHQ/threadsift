import type { Item } from "../../src/http/schemas.ts";
import { HighlightsProvider } from "./Highlights.tsx";
import { NoteBox } from "./NoteBox.tsx";
import { READER_FAILED, READER_STALE } from "./reader-text.ts";
import { Agent } from "./ReaderColumn.tsx";
import { Original } from "./ReaderOriginal.tsx";
import { RETRY_LABEL } from "./text.ts";
import type { DetailActions, DetailState } from "./use-item-detail.ts";

export function ReaderContent({
  item,
  state,
  actions,
  announce,
  tryAgain,
  now,
}: Readonly<{
  item: Item;
  state: Exclude<DetailState, { status: "loading" }>;
  actions: DetailActions;
  announce: (text: string) => void;
  tryAgain: (item: Item) => void;
  now: number;
}>) {
  if (state.status === "failed") {
    return (
      <div className="rd-orig" role="alert">
        <p className="rd-note">{READER_FAILED}</p>
        <button type="button" className="btn btn-block" onClick={actions.retry}>
          {RETRY_LABEL}
        </button>
      </div>
    );
  }

  return (
    <>
      {state.stale ? (
        <div className="rd-orig">
          <output className="rd-note">{READER_STALE}</output>
          <button type="button" className="btn btn-block" onClick={actions.retry}>
            {RETRY_LABEL}
          </button>
        </div>
      ) : null}
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
