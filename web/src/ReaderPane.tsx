import { type ComponentProps, useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { ArrivalsContext, useNewArrivals } from "./place-arrival.ts";
import { Reader, type ReaderControls } from "./Reader.tsx";
import { Placed } from "./ReaderPlaced.tsx";
import { Placeholder } from "./ReaderPlaceholder.tsx";
import type { Pages } from "./routing.ts";
import type { Announcement as AnnouncementState } from "./use-announcement.ts";
import { useHeldPanelState } from "./use-panel.ts";
import type { Look } from "./use-root.ts";

export function ReaderPane({
  item,
  controls,
  nav,
  look,
  pages,
  tryAgain,
  announcement,
}: Readonly<{
  item: Item | null;
  controls: ReaderControls;
  nav: ComponentProps<typeof Placed>["nav"];
  look: Look;
  pages: Pages;
  tryAgain: (item: Item) => void;
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
        pages={pages}
        panel={panel}
        tryAgain={tryAgain}
      />
    </div>
  );

  return (
    <ArrivalsContext value={arrivals}>
      <Placed place={look.reader} titleId={titleId} nav={nav} announcement={announcement}>
        {reader}
      </Placed>
    </ArrivalsContext>
  );
}
