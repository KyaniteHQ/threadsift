import { type RefObject, use, useEffect } from "react";

import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { postTextModule } from "./post-text-module.ts";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
import { ReaderContent, ReaderNotices } from "./ReaderContent.tsx";
import type { DetailActions, DetailState } from "./use-item-detail.ts";
import { useReadingPlace } from "./use-reading-place.ts";

function drawsMarkdown(detail: Readonly<ItemDetail>): boolean {
  return (detail.postText ?? "").trim() !== "" || detail.comments.nodes.length > 0;
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
  useEffect(() => {
    void postTextModule();
  }, []);

  if (state.status === "ready" && drawsMarkdown(state.detail)) use(postTextModule());

  useReadingPlace(slot, item.id, state.status === "ready");

  const loading = state.status === "loading";
  const content = { item, actions, announce, tryAgain, now };

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
      <ReaderNotices state={state} retry={actions.retry} />
      {loading ? <ReaderLoading /> : null}
      {state.status === "ready" ? <ReaderContent {...content} state={state} /> : null}
    </>
  );
}
