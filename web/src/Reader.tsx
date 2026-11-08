import { type RefObject, Suspense, useMemo, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { type BarMode, ReaderBar } from "./ReaderBar.tsx";
import { ReaderBody } from "./ReaderBody.tsx";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
import { useFocusMoved } from "./use-focus-moved.ts";
import { refreshKey, useItemDetail } from "./use-item-detail.ts";
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

function ReaderPending({
  item,
  now,
  titleId,
  focusTitle,
  tryAgain,
}: Readonly<{
  item: Item;
  now: number;
  titleId: string;
  focusTitle: boolean;
  tryAgain: (item: Item) => void;
}>) {
  return (
    <>
      <ReaderHead
        item={item}
        detail={null}
        now={now}
        titleId={titleId}
        focusTitle={focusTitle}
        loading
        tryAgain={tryAgain}
      />
      <ReaderLoading />
    </>
  );
}

function ReaderCol({
  item,
  slot,
  controls,
  titleId,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  titleId: string;
  tryAgain: (item: Item) => void;
}>) {
  const [now] = useState(Date.now);
  const { state, retry } = useItemDetail(item.id, refreshKey(item));
  const moved = useFocusMoved();
  const focusTitle = !moved && (controls.mode !== "pane" || controls.titleFocus === item.id);

  const pending = useMemo(
    () => (
      <ReaderPending
        item={item}
        now={now}
        titleId={titleId}
        focusTitle={focusTitle}
        tryAgain={tryAgain}
      />
    ),
    [focusTitle, item, now, titleId, tryAgain],
  );

  return (
    <div className="rd-col">
      <Suspense fallback={pending}>
        <ReaderBody
          item={item}
          slot={slot}
          state={state}
          retry={retry}
          now={now}
          settingsKey={controls.settingsKey}
          titleId={titleId}
          focusTitle={focusTitle}
          tryAgain={tryAgain}
        />
      </Suspense>
    </div>
  );
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
  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar item={item} controls={controls} look={look} openSettings={openSettings} />
      <ReaderCol
        item={item}
        slot={slot}
        controls={controls}
        titleId={titleId}
        tryAgain={tryAgain}
      />
    </section>
  );
}
