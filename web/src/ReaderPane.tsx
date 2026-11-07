import { useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { READER_PLACEHOLDER } from "./reader-text.ts";
import { Reader, type ReaderControls } from "./Reader.tsx";
import { Sheet, type SheetNav } from "./Sheet.tsx";
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
  openSettings,
  tryAgain,
}: Readonly<{
  item: Item | null;
  controls: ReaderControls;
  nav: SheetNav;
  look: Look;
  openSettings: () => void;
  tryAgain: (item: Item) => void;
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
        openSettings={openSettings}
        tryAgain={tryAgain}
      />
    </div>
  );

  return look.reader === "sheet" ? (
    <Sheet titleId={titleId} nav={nav}>
      {reader}
    </Sheet>
  ) : (
    reader
  );
}
