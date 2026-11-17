import { type RefObject, useCallback } from "react";

import { focusListStart } from "./reveal.ts";
import { SKIP_LABEL } from "./text.ts";

export function SkipButton({ pane }: Readonly<{ pane: RefObject<HTMLElement | null> }>) {
  const skip = useCallback(() => {
    if (pane.current !== null) {
      focusListStart(pane.current);
    }
  }, [pane]);

  return (
    <button type="button" className="btn skip" onClick={skip}>
      {SKIP_LABEL}
    </button>
  );
}
