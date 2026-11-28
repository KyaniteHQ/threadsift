import { useEffect, useRef } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { HighlightsProvider } from "./Highlights.tsx";
import { useSectionIds } from "./reader-sections.ts";
import { READER_FAILED, READER_STALE } from "./reader-text.ts";
import { Agent } from "./ReaderColumn.tsx";
import { Original } from "./ReaderOriginal.tsx";
import { ReaderSide } from "./ReaderSide.tsx";
import { AlertRegion, StatusRegion } from "./RetryRegions.tsx";
import type { SideSlot } from "./side-column.ts";
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
  side,
}: Readonly<{
  item: Item;
  state: Extract<DetailState, { status: "ready" }>;
  actions: DetailActions;
  announce: (text: string) => void;
  tryAgain: RetryOpened;
  now: number;
  side: SideSlot;
}>) {
  const { detail } = state;
  const ids = useSectionIds();

  return (
    <HighlightsProvider
      itemId={item.id}
      view={detail.highlights}
      actions={actions}
      announce={announce}
    >
      <Agent item={item} detail={detail} summaryId={ids.summary} tryAgain={tryAgain} />
      <Original item={item} detail={detail} now={now} ids={ids} />
      <ReaderSide side={side} item={item} detail={detail} ids={ids} />
    </HighlightsProvider>
  );
}
