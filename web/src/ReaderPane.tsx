import { type ReactNode, useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Announcement } from "./Announcement.tsx";
import { ArrivalsContext, useNewArrivals } from "./place-arrival.ts";
import { Reader, type ReaderControls } from "./Reader.tsx";
import { Placeholder } from "./ReaderPlaceholder.tsx";
import type { Pages } from "./routing.ts";
import { Sheet, type SheetNav } from "./Sheet.tsx";
import type { Announcement as AnnouncementState } from "./use-announcement.ts";
import type { Look } from "./use-root.ts";

function Placed({
  place,
  titleId,
  nav,
  announcement,
  children,
}: Readonly<{
  place: Look["reader"];
  titleId: string;
  nav: SheetNav;
  announcement: AnnouncementState;
  children: ReactNode;
}>) {
  return place === "sheet" ? (
    <Sheet titleId={titleId} nav={nav}>
      {children}
      <Announcement {...announcement} />
    </Sheet>
  ) : (
    children
  );
}

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
  nav: SheetNav;
  look: Look;
  pages: Pages;
  tryAgain: (item: Item) => void;
  announcement: AnnouncementState;
}>) {
  const slot = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const arrivals = useNewArrivals();

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
