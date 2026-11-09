import { type RefObject, useCallback, useMemo } from "react";

import { useLastListEmpty } from "./last-list.ts";
import type { ListState } from "./list-state.ts";
import { BASE_SAMPLE, FACE_WAIT_MS, LOOK_FONTS, sampleOf } from "./load-fonts.ts";
import { useFaces } from "./use-faces.ts";
import type { Look } from "./use-root.ts";
import { useSearchIntent } from "./use-search-intent.ts";

function sampleOfList(list: Readonly<ListState>): string | null {
  switch (list.status) {
    case "loading":
      return null;
    case "failed":
      return BASE_SAMPLE;
    case "ready":
      return sampleOf(JSON.stringify([list.items, list.counts]));
    default: {
      const exhaustive: never = list;

      return exhaustive;
    }
  }
}

export function useShownList({
  root,
  searchField,
  list,
  look,
}: Readonly<{
  root: RefObject<HTMLElement | null>;
  searchField: RefObject<HTMLInputElement | null>;
  list: ListState;
  look: Look;
}>) {
  const sample = useMemo(() => sampleOfList(list), [list]);
  const [faces, releaseList] = useFaces(root, LOOK_FONTS, FACE_WAIT_MS, sample);
  const shown: ListState = faces ? list : { status: "loading", known: list.known };
  const { releaseFaces } = look;

  const release = useCallback(() => {
    releaseFaces();
    releaseList();
  }, [releaseFaces, releaseList]);

  const focusSearch = useSearchIntent(searchField, faces && look.faces, release);

  const expectsEmpty = useLastListEmpty(list);

  return { shown, focusSearch, expectsEmpty };
}
