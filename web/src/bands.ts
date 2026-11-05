import { type RefObject, useLayoutEffect, useState } from "react";

const BANDS = ["phone", "narrow", "medium", "wide"] as const;

function readBreakpoints(): number[] | null {
  const style = getComputedStyle(document.documentElement);

  const widths = BANDS.map((band) =>
    Number(style.getPropertyValue(`--bp-${band}`).trim().replace(/px$/u, "")),
  );

  return widths.every((width) => width > 0) ? widths : null;
}

function bandsOf(width: number, limits: readonly number[] | null): string[] {
  const under = limits === null ? [] : BANDS.filter((_band, index) => width < (limits[index] ?? 0));

  return [...under, "full"];
}

export function useBands(root: RefObject<HTMLElement | null>): string[] {
  const [bands, setBands] = useState(["full"]);
  useLayoutEffect(() => {
    const element = root.current;
    let limits = readBreakpoints();

    const measure = (): void => {
      if (element !== null) {
        const next = bandsOf(element.clientWidth, limits);
        setBands((previous) => (previous.join(" ") === next.join(" ") ? previous : next));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);

    if (element !== null) {
      observer.observe(element);
    }

    const remeasure = (): void => {
      limits = readBreakpoints();
      measure();
    };

    window.addEventListener("load", remeasure);

    return () => {
      observer.disconnect();
      window.removeEventListener("load", remeasure);
    };
  }, [root]);

  return bands;
}
