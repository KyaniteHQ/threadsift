import { useId } from "react";

import { Icon } from "./Icon.tsx";
import { READER_PLACEHOLDER } from "./reader-text.ts";

export function Placeholder() {
  const placeholderId = useId();

  return (
    <section className="reader-ph" aria-labelledby={placeholderId}>
      <Icon name="document" className="ic ic-xl" />
      <span id={placeholderId}>{READER_PLACEHOLDER}</span>
    </section>
  );
}
