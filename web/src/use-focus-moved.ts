import { useEffect, useState } from "react";

import { panelHoldsFocus } from "./panel-dom.ts";

export function useFocusMoved(): boolean {
  const [moved, setMoved] = useState(panelHoldsFocus);

  useEffect(() => {
    const controller = new AbortController();

    document.addEventListener(
      "focusin",
      () => {
        setMoved(true);
      },
      { once: true, signal: controller.signal },
    );

    return () => {
      controller.abort();
    };
  }, []);

  return moved;
}
