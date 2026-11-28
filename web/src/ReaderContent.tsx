import { useEffect, useRef } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { HighlightsProvider } from "./Highlights.tsx";
import { NoteBox } from "./NoteBox.tsx";
import { READER_FAILED, READER_STALE } from "./reader-text.ts";
import { Agent } from "./ReaderColumn.tsx";
import { Original } from "./ReaderOriginal.tsx";
import { AlertRegion, StatusRegion } from "./RetryRegions.tsx";
import type { Copy, DetailActions, DetailState } from "./use-item-detail.ts";
import type { RetryOpened } from "./use-list-actions.ts";

function copyOf(state: DetailState): Copy | null {
  return state.status === "ready" ? state.copy : null;
}

function useFailedRereadNotice(copy: Copy | null, announce: (text: string) => void): void {
  const was = useRef(copy);

  useEffect(() => {
    if (was.current === "rereading" && copy === "earlier") announce(READER_STALE);

    was.current = copy;
  }, [announce, copy]);
}

export function ReaderNotices({
  state,
  retry,
  announce,
}: Readonly<{ state: DetailState; retry: () => void; announce: (text: string) => void }>) {
  const copy = copyOf(state);

  useFailedRereadNotice(copy, announce);

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
        text={copy === "earlier" || copy === "rereading" ? READER_STALE : null}
        busy={copy === "rereading"}
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
