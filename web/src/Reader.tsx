import { type RefObject, Suspense, useMemo, useState } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { BESIDE, useMarginColumn } from "./margin-column.ts";
import { ReaderBar } from "./ReaderBar.tsx";
import { ReaderBody } from "./ReaderBody.tsx";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
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
  look,
  titleId,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  controls: ReaderControls;
  look: Look;
  titleId: string;
  tryAgain: (item: Item) => void;
}>) {
  const [now] = useState(Date.now);
  const { col, host, margin } = useMarginColumn(look.reader);
  const { state, actions } = useItemDetail(item.id, refreshKey(item));
  const moved = useFocusMoved();
  const focusTitle = !moved && (controls.mode !== "pane" || controls.titleFocus === item.id);

  const pending = useMemo(
    () => <ReaderPending {...{ item, now, titleId, focusTitle, tryAgain }} />,
    [focusTitle, item, now, titleId, tryAgain],
  );

  return (
    <div ref={col} className="rd-col" data-margin={margin.beside ? BESIDE : undefined}>
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
            margin={margin}
          />
        </Suspense>
      </div>
      <div ref={host} className="rd-margin" />
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
  tryAgain: (item: Item) => void;
}>) {
  usePageName(item.digestTitle ?? item.title ?? "");

  return (
    <section className="reader" aria-labelledby={titleId}>
      <ReaderBar item={item} controls={controls} look={look} panel={panel} />
      <ReaderCol
        item={item}
        slot={slot}
        controls={controls}
        look={look}
        titleId={titleId}
        tryAgain={tryAgain}
      />
    </section>
  );
}
