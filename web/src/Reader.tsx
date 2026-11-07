import { type RefObject, Suspense, use, useMemo, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { postTextModule } from "./post-text-module.ts";
import { READER_LOADING } from "./reader-text.ts";
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
  readonly remove: (item: Item) => Promise<void>;
  readonly close: () => void;
  readonly hintPlaced: (inBar: boolean) => void;
}

function Loading({ id }: Readonly<{ id: string }>) {
  return (
    <output id={id} className="rd-note">
      {READER_LOADING}
    </output>
  );
}

function ReaderBody({
  item,
  slot,
  controls,
  titleId,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  titleId: string;
}>) {
  use(postTextModule());

  const [now] = useState(Date.now);
  const { state, retry } = useItemDetail(item.id, refreshKey(item));
  useReadingPlace(slot, item.id, state.status === "ready", controls.settingsKey);

  return (
    <ReaderColumn
      item={item}
      state={state}
      retry={retry}
      now={now}
      titleId={titleId}
      focusTitle={controls.mode !== "pane" || controls.titleFocus === item.id}
    />
  );
}

export function Reader({
  item,
  slot,
  controls,
  look,
  titleId,
  openSettings,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  look: Look;
  titleId: string;
  openSettings: () => void;
}>) {
  const loading = useMemo(() => <Loading id={titleId} />, [titleId]);

  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar item={item} controls={controls} look={look} openSettings={openSettings} />
      <Suspense fallback={loading}>
        <ReaderBody item={item} slot={slot} controls={controls} titleId={titleId} />
      </Suspense>
    </section>
  );
}
