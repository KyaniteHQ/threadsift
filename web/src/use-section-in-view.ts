import { type RefObject, useEffect, useState } from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";

const READING_LINE = 0.2;

function atEnd(scroller: HTMLElement): boolean {
  const { scrollTop, clientHeight, scrollHeight } = scroller;

  return scrollHeight > clientHeight && scrollTop + clientHeight >= scrollHeight - 1;
}

function sectionAt(scroller: HTMLElement, sections: readonly HTMLElement[]): string | null {
  const view = scroller.getBoundingClientRect();
  const line = atEnd(scroller) ? view.bottom : view.top + scroller.clientHeight * READING_LINE;

  return sections.findLast((section) => section.getBoundingClientRect().top <= line)?.id ?? null;
}

function watchSections(
  scroller: HTMLElement,
  sections: readonly HTMLElement[],
  show: (id: string | null) => void,
): () => void {
  let frame = 0;

  const measure = (): void => {
    frame = 0;
    show(sectionAt(scroller, sections));
  };

  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(measure);
  };

  const resized = new ResizeObserver(schedule);
  resized.observe(scroller);

  for (const section of sections) resized.observe(section);

  scroller.addEventListener("scroll", schedule, { passive: true });
  schedule();

  return () => {
    cancelAnimationFrame(frame);
    resized.disconnect();
    scroller.removeEventListener("scroll", schedule);
  };
}

export function useSectionInView(
  rail: RefObject<HTMLElement | null>,
  ids: readonly string[],
  ready: boolean,
): string | null {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const scroller = rail.current?.closest<HTMLElement>(".pg, .reader-slot") ?? null;

    if (!ready || scroller === null) return NOTHING;

    const sections = ids.flatMap((id) => {
      const section = document.querySelector(`#${CSS.escape(id)}`);

      return section instanceof HTMLElement ? [section] : [];
    });

    return watchSections(scroller, sections, setCurrent);
  }, [rail, ids, ready]);

  return current;
}
