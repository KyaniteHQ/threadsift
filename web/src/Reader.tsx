import { type RefObject, Suspense, useMemo, useState } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { ReaderBar } from "./ReaderBar.tsx";
import { ReaderBody } from "./ReaderBody.tsx";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
import type { Pages } from "./routing.ts";
import { usePageName } from "./use-document-title.ts";
import { useFocusMoved } from "./use-focus-moved.ts";
import { refreshKey, useItemDetail } from "./use-item-detail.ts";
import type { PanelState } from "./use-panel.ts";
import type { ReaderControls } from "./use-reader-controls.ts";
import type { Look } from "./use-root.ts";

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
  const { state, actions } = useItemDetail(item.id, refreshKey(item));
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
          actions={actions}
          announce={controls.announce}
          now={now}
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
  pages,
  panel,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  look: Look;
  titleId: string;
  pages: Pages;
  panel: PanelState;
  tryAgain: (item: Item) => void;
}>) {
  usePageName(item.digestTitle ?? item.title ?? "");

  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar item={item} controls={controls} look={look} pages={pages} panel={panel} />
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
