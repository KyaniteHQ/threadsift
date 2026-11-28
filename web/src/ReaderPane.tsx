import { type ReactNode, useId, useRef } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { ArrivalsContext, useNewArrivals } from "./place-arrival.ts";
import { Reader } from "./Reader.tsx";
import { Placed } from "./ReaderPlaced.tsx";
import { Placeholder } from "./ReaderPlaceholder.tsx";
import { RefusedRetryContext } from "./refused-retry.ts";
import type { SheetNav } from "./Sheet.tsx";
import type { Announcement as AnnouncementState } from "./use-announcement.ts";
import type { RefusedRetry } from "./use-list-actions.ts";
import { useHeldPanelState } from "./use-panel.ts";
import type { ReaderControls } from "./use-reader-controls.ts";
import type { Look } from "./use-root.ts";

function RefusedRetryScope({
  item,
  refusedRetry,
  children,
}: Readonly<{ item: Item; refusedRetry: RefusedRetry | null; children: ReactNode }>) {
  return (
    <RefusedRetryContext value={refusedRetry?.url === item.originalUrl ? refusedRetry.kind : null}>
      {children}
    </RefusedRetryContext>
  );
}

export function ReaderPane({
  item,
  controls,
  nav,
  look,
  tryAgain,
  refusedRetry,
  announcement,
}: Readonly<{
  item: Item | null;
  controls: ReaderControls;
  nav: SheetNav;
  look: Look;
  tryAgain: (item: Item) => void;
  refusedRetry: RefusedRetry | null;
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
      <RefusedRetryScope item={item} refusedRetry={refusedRetry}>
        <Placed place={look.reader} titleId={titleId} nav={nav} announcement={announcement}>
          {reader}
        </Placed>
      </RefusedRetryScope>
    </ArrivalsContext>
  );
}
