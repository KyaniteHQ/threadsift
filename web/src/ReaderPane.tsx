import { useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { READER_PLACEHOLDER } from "./reader-text.ts";
import { Reader, type ReaderControls } from "./Reader.tsx";
import type { Look } from "./use-root.ts";

export function ReaderPane({
  item,
  controls,
  look,
  openSettings,
}: Readonly<{
  item: Item | null;
  controls: ReaderControls;
  look: Look;
  openSettings: () => void;
}>) {
  const slot = useRef<HTMLDivElement>(null);
  const placeholderId = useId();

  if (item === null) {
    return (
      <section className="reader-ph" aria-labelledby={placeholderId}>
        <Icon name="document" className="ic ic-xl" />
        <span id={placeholderId}>{READER_PLACEHOLDER}</span>
      </section>
    );
  }

  return (
    <div ref={slot} className="reader-slot">
      <Reader
        key={item.id}
        item={item}
        slot={slot}
        controls={controls}
        look={look}
        openSettings={openSettings}
      />
    </div>
  );
}
