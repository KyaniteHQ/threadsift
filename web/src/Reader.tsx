import { type RefObject, use, useId, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { postTextModule } from "./post-text-module.ts";
import { type BarMode, ReaderBar } from "./ReaderBar.tsx";
import { ReaderColumn } from "./ReaderColumn.tsx";
import { refreshKey, useItemDetail } from "./use-item-detail.ts";
import { useReadingPlace } from "./use-reading-place.ts";
import type { Look } from "./use-root.ts";

export interface ReaderControls {
  readonly mode: BarMode;
  readonly settingsKey: string;
  readonly titleFocus: number | null;
  readonly toggleRead: (item: Item) => void;
  readonly close: () => void;
  readonly hintPlaced: (inBar: boolean) => void;
}

export function Reader({
  item,
  slot,
  controls,
  look,
  openSettings,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  look: Look;
  openSettings: () => void;
}>) {
  use(postTextModule());

  const titleId = useId();
  const [now] = useState(Date.now);
  const { state, retry } = useItemDetail(item.id, refreshKey(item));
  useReadingPlace(slot, item.id, state.status === "ready", controls.settingsKey);

  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar item={item} controls={controls} look={look} openSettings={openSettings} />
      <ReaderColumn
        item={item}
        state={state}
        retry={retry}
        now={now}
        titleId={titleId}
        focusTitle={controls.mode !== "pane" || controls.titleFocus === item.id}
      />
    </section>
  );
}
