import { type RefObject, use } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { postTextModule } from "./post-text-module.ts";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
import { ReaderContent } from "./ReaderContent.tsx";
import type { DetailActions, DetailState } from "./use-item-detail.ts";
import { useReadingPlace } from "./use-reading-place.ts";

function useReadyState(
  state: DetailState,
  slot: RefObject<HTMLElement | null>,
  itemId: number,
): Exclude<DetailState, { status: "loading" }> | null {
  use(postTextModule());

  const ready = state.status === "loading" ? null : state;

  useReadingPlace(slot, itemId, ready?.status === "ready");

  return ready;
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
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  state: DetailState;
  actions: DetailActions;
  announce: (text: string) => void;
  now: number;
  titleId: string;
  focusTitle: boolean;
  tryAgain: (item: Item) => void;
}>) {
  const ready = useReadyState(state, slot, item.id);
  const content = { item, actions, announce, tryAgain, now };

  return (
    <>
      <ReaderHead
        item={item}
        detail={state.status === "ready" ? state.detail : null}
        now={now}
        titleId={titleId}
        focusTitle={focusTitle}
        loading={ready === null}
        tryAgain={tryAgain}
      />
      {ready === null ? <ReaderLoading /> : <ReaderContent {...content} state={ready} />}
    </>
  );
}
