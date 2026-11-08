import { type RefObject, Suspense, use, useMemo, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { postTextModule } from "./post-text-module.ts";
import { READER_LOADING } from "./reader-text.ts";
import { type BarMode, ReaderBar } from "./ReaderBar.tsx";
import { ReaderContent, ReaderHead } from "./ReaderColumn.tsx";
import { type DetailState, refreshKey, useItemDetail } from "./use-item-detail.ts";
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

function Loading() {
  return <output className="rd-note">{READER_LOADING}</output>;
}

function ReaderBody({
  item,
  slot,
  state,
  retry,
  now,
  settingsKey,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  state: DetailState;
  retry: () => void;
  now: number;
  settingsKey: string;
  tryAgain: (item: Item) => void;
}>) {
  use(postTextModule());
  useReadingPlace(slot, item.id, state.status === "ready", settingsKey);

  return <ReaderContent item={item} state={state} retry={retry} tryAgain={tryAgain} now={now} />;
}

export function Reader({
  item,
  slot,
  controls,
  look,
  titleId,
  openSettings,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  look: Look;
  titleId: string;
  openSettings: () => void;
  tryAgain: (item: Item) => void;
}>) {
  const loading = useMemo(() => <Loading />, []);
  const [now] = useState(Date.now);
  const { state, retry } = useItemDetail(item.id, refreshKey(item));

  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar item={item} controls={controls} look={look} openSettings={openSettings} />
      <div className="rd-col">
        <ReaderHead
          item={item}
          detail={state.status === "ready" ? state.detail : null}
          now={now}
          titleId={titleId}
          focusTitle={controls.mode !== "pane" || controls.titleFocus === item.id}
          tryAgain={tryAgain}
        />
        <Suspense fallback={loading}>
          <ReaderBody
            item={item}
            slot={slot}
            state={state}
            retry={retry}
            now={now}
            settingsKey={controls.settingsKey}
            tryAgain={tryAgain}
          />
        </Suspense>
      </div>
    </section>
  );
}
