import { type RefObject, useCallback } from "react";

import { focusListStart } from "./reveal.ts";
import { SKIP_LABEL } from "./text.ts";

export function SkipButton({
  pane,
  inert,
}: Readonly<{ pane: RefObject<HTMLElement | null>; inert: boolean }>) {
  const skip = useCallback(() => {
    if (pane.current !== null) {
      focusListStart(pane.current);
    }
  }, [pane]);

  return (
    <button type="button" className="btn skip" inert={inert} onClick={skip}>
      {SKIP_LABEL}
    </button>
  );
}
