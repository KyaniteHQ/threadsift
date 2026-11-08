import { useEffect, useState } from "react";

export function useFocusMoved(): boolean {
  const [moved, setMoved] = useState(false);

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
