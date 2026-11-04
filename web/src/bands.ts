import { type RefObject, useLayoutEffect, useState } from "react";

const BANDS = ["phone", "narrow", "medium", "wide"] as const;

function readBreakpoints(): number[] | null {
  const style = getComputedStyle(document.documentElement);

  const widths = BANDS.map((band) =>
    Number(style.getPropertyValue(`--bp-${band}`).trim().replace(/px$/u, "")),
  );

  return widths.every((width) => width > 0) ? widths : null;
}

function bandsOf(width: number): string {
  const limits = readBreakpoints();
  const under = limits === null ? [] : BANDS.filter((_band, index) => width < (limits[index] ?? 0));

  return [...under, "full"].join(" ");
}

export function useBands(root: RefObject<HTMLElement | null>): string {
  const [bands, setBands] = useState("full");
  useLayoutEffect(() => {
    const element = root.current;

    const measure = (): void => {
      if (element !== null) {
        setBands(bandsOf(element.clientWidth));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);

    if (element !== null) {
      observer.observe(element);
    }

    window.addEventListener("load", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("load", measure);
    };
  }, [root]);

  return bands;
}
