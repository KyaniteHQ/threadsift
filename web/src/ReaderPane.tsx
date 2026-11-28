import { type ReactNode, useId, useRef } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { ArrivalsContext, useNewArrivals } from "./place-arrival.ts";
import { Reader } from "./Reader.tsx";
import { Placed } from "./ReaderPlaced.tsx";
import { Placeholder } from "./ReaderPlaceholder.tsx";
import { SharedItem } from "./SharedItem.tsx";
import type { SheetNav } from "./Sheet.tsx";
import type { Announcement as AnnouncementState } from "./use-announcement.ts";
import type { RetryOpened } from "./use-list-actions.ts";
import { useHeldPanelState } from "./use-panel.ts";
import type { ReaderControls } from "./use-reader-controls.ts";
import type { Look } from "./use-root.ts";

function CoveringItem({
  id,
  pane,
  children,
}: Readonly<{ id: number; pane: boolean; children: ReactNode }>) {
  if (pane) return children;

  return (
    <SharedItem key={id} id={id}>
      {children}
    </SharedItem>
  );
}

export function ReaderPane({
  item,
  controls,
  nav,
  look,
  tryAgain,
  announcement,
}: Readonly<{
  item: Item | null;
  controls: ReaderControls;
  nav: SheetNav;
  look: Look;
  tryAgain: RetryOpened;
  announcement: AnnouncementState;
}>) {
  const slot = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const arrivals = useNewArrivals();
  const panel = useHeldPanelState(item === null || look.reader === "pane" ? null : String(item.id));

  if (item === null) return <Placeholder />;

  const reader = (
    <div ref={slot} className="reader-slot">
      <Reader
        key={item.id}
        item={item}
        slot={slot}
        controls={controls}
        look={look}
        titleId={titleId}
        panel={panel}
        tryAgain={tryAgain}
      />
    </div>
  );

  return (
    <ArrivalsContext value={arrivals}>
      <Placed place={look.reader} titleId={titleId} nav={nav} announcement={announcement}>
        <CoveringItem id={item.id} pane={look.reader === "pane"}>
          {reader}
        </CoveringItem>
      </Placed>
    </ArrivalsContext>
  );
}
