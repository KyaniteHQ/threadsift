import { type RefObject, use, useEffect } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { postTextReady } from "./post-text-module.ts";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
import { ReaderContent, ReaderNotices } from "./ReaderContent.tsx";
import { drawsMarkdown } from "./ReaderOriginal.tsx";
import type { SideSlot } from "./side-column.ts";
import type { DetailActions, DetailState } from "./use-item-detail.ts";
import type { RetryOpened } from "./use-list-actions.ts";
import { useReadingPlace } from "./use-reading-place.ts";

const TEXT_FAILED: DetailState = { status: "failed" };

function reloadPage(): void {
  window.location.reload();
}

function useTextReady(state: DetailState): boolean {
  useEffect(() => {
    void postTextReady();
  }, []);

  return state.status === "ready" && drawsMarkdown(state.detail) ? use(postTextReady()) : true;
}

function useShownState(state: DetailState, slot: RefObject<HTMLElement | null>, itemId: number) {
  const textReady = useTextReady(state);
  const shown = textReady ? state : TEXT_FAILED;

  useReadingPlace(slot, itemId, shown.status === "ready");

  return { textReady, shown };
}

export function ReaderBody({
  item,
  slot,
  state,
  actions,
  announce,
  now,
  titleId,
  focusTitle,
  tryAgain,
  side,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  state: DetailState;
  actions: DetailActions;
  announce: (text: string) => void;
  now: number;
  titleId: string;
  focusTitle: boolean;
  tryAgain: RetryOpened;
  side: SideSlot;
}>) {
  const { textReady, shown } = useShownState(state, slot, item.id);
  const loading = shown.status === "loading";
  const content = { item, actions, announce, tryAgain, now, side };

  return (
    <>
      <ReaderHead
        item={item}
        detail={state.status === "ready" ? state.detail : null}
        now={now}
        titleId={titleId}
        focusTitle={focusTitle}
        loading={loading}
        tryAgain={tryAgain}
      />
      <ReaderNotices
        state={shown}
        retry={textReady ? actions.retry : reloadPage}
        announce={announce}
      />
      {loading ? <ReaderLoading /> : null}
      {shown.status === "ready" ? <ReaderContent {...content} state={shown} /> : null}
    </>
  );
}
