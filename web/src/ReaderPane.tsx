import { useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Announcement } from "./Announcement.tsx";
import { Icon } from "./Icon.tsx";
import { READER_PLACEHOLDER } from "./reader-text.ts";
import { Reader, type ReaderControls } from "./Reader.tsx";
import type { Pages } from "./routing.ts";
import { Sheet, type SheetNav } from "./Sheet.tsx";
import type { Announcement as AnnouncementState } from "./use-announcement.ts";
import type { Look } from "./use-root.ts";

function Placeholder() {
  const placeholderId = useId();

  return (
    <section className="reader-ph" aria-labelledby={placeholderId}>
      <Icon name="document" className="ic ic-xl" />
      <span id={placeholderId}>{READER_PLACEHOLDER}</span>
    </section>
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

  return look.reader === "sheet" ? (
    <Sheet titleId={titleId} nav={nav}>
      {reader}
      <Announcement {...announcement} />
    </Sheet>
  ) : (
    reader
  );
}
