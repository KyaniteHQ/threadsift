import { type RefObject, Suspense, useMemo, useState } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { ReaderBar } from "./ReaderBar.tsx";
import { ReaderBody } from "./ReaderBody.tsx";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
import { BESIDE, type SideColumn, useSideColumn } from "./side-column.ts";
import { usePageName } from "./use-document-title.ts";
import { useFocusMoved } from "./use-focus-moved.ts";
import { refreshKey, useItemDetail } from "./use-item-detail.ts";
import type { RetryOpened } from "./use-list-actions.ts";
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
  tryAgain: RetryOpened;
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
  column: { col, host, side },
  titleId,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  column: SideColumn;
  titleId: string;
  tryAgain: RetryOpened;
}>) {
  const [now] = useState(Date.now);
  const { state, actions } = useItemDetail(item.id, refreshKey(item), controls.forget);
  const moved = useFocusMoved();
  const focusTitle = !moved && (controls.mode !== "pane" || controls.titleFocus === item.id);

  const pending = useMemo(
    () => <ReaderPending {...{ item, now, titleId, focusTitle, tryAgain }} />,
    [focusTitle, item, now, titleId, tryAgain],
  );

  return (
    <div ref={col} className="rd-col" data-side={side.beside ? BESIDE : undefined}>
      <div className="rd-main">
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
            side={side}
          />
        </Suspense>
      </div>
      <div ref={host} className="rd-side" />
    </div>
  );
}

export function Reader({
  item,
  slot,
  controls,
  look,
  titleId,
  panel,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  look: Look;
  titleId: string;
  panel: PanelState;
  tryAgain: RetryOpened;
}>) {
  usePageName(item.digestTitle ?? item.title ?? "");
  const column = useSideColumn(look.reader);

  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar
        item={item}
        controls={controls}
        look={look}
        panel={panel}
        beside={column.side.beside}
        commentsListed={column.commentsListed}
      />
      <ReaderCol
        item={item}
        slot={slot}
        controls={controls}
        column={column}
        titleId={titleId}
        tryAgain={tryAgain}
      />
    </section>
  );
}
