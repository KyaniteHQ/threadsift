import { Suspense, useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { READER_LOADING, READER_PLACEHOLDER } from "./reader-text.ts";
import { Reader, type ReaderControls } from "./Reader.tsx";

const LOADING = <output className="rd-note">{READER_LOADING}</output>;

export function ReaderPane({
  item,
  controls,
}: Readonly<{ item: Item | null; controls: ReaderControls }>) {
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
      <Suspense fallback={LOADING}>
        <Reader key={item.id} item={item} slot={slot} controls={controls} />
      </Suspense>
    </div>
  );
}
