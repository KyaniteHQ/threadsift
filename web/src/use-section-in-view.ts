import { type RefObject, useEffect, useState } from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";

const READING_LINE = "-20% 0px -79% 0px";

function watchSections(
  scroller: HTMLElement,
  sections: readonly HTMLElement[],
  show: (id: string) => void,
): () => void {
  const crossing = new Set<string>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) crossing.add(target.id);
        else crossing.delete(target.id);
      }

      const current = sections.find(({ id }) => crossing.has(id));

      if (current !== undefined) show(current.id);
    },
    { root: scroller, rootMargin: READING_LINE },
  );

  for (const section of sections) observer.observe(section);

  return () => {
    observer.disconnect();
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
