import type { Item } from "../../src/core/contract/item-wire.ts";
import { HighlightsProvider } from "./Highlights.tsx";
import { NoteBox } from "./NoteBox.tsx";
import { READER_FAILED, READER_STALE } from "./reader-text.ts";
import { Agent } from "./ReaderColumn.tsx";
import { Original } from "./ReaderOriginal.tsx";
import { AlertRegion, StatusRegion } from "./RetryRegions.tsx";
import type { DetailActions, DetailState } from "./use-item-detail.ts";
import type { RetryOpened } from "./use-list-actions.ts";

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
}: Readonly<{
  item: Item;
  state: Extract<DetailState, { status: "ready" }>;
  actions: DetailActions;
  announce: (text: string) => void;
  tryAgain: RetryOpened;
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
