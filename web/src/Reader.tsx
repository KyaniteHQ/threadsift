import { type RefObject, use, useId, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { postTextModule } from "./post-text-module.ts";
import { type BarMode, ReaderBar } from "./ReaderBar.tsx";
import { ReaderColumn } from "./ReaderColumn.tsx";
import { refreshKey, useItemDetail } from "./use-item-detail.ts";
import { useReadingPlace } from "./use-reading-place.ts";

export interface ReaderControls {
  readonly mode: BarMode;
  readonly settingsKey: string;
  readonly toggleRead: (item: Item) => void;
  readonly close: () => void;
  readonly hintPlaced: (inBar: boolean) => void;
}

export function Reader({
  item,
  slot,
  controls,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
}>) {
  use(postTextModule);

  const titleId = useId();
  const [now] = useState(Date.now);
  const { state, retry } = useItemDetail(item.id, refreshKey(item));
  useReadingPlace(slot, item.id, state.status === "ready");

  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar item={item} controls={controls} />
      <ReaderColumn
        item={item}
        state={state}
        retry={retry}
        now={now}
        titleId={titleId}
        focusTitle={controls.mode !== "pane"}
      />
    </section>
  );
}
