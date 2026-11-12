import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { itemIdOf, itemPath } from "../../src/core/item-path.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { placePath } from "./place.ts";

export const SETTINGS_PATH = "/settings";

export const HIGHLIGHTS_PATH = "/highlights";

export const IMPORT_PATH = "/import";

export const INDEX_PATH = "/topics";

export const LOG_PATH = "/log";

export const PROPOSALS_PATH = "/proposals";

export const RESET_PATH = "/reset";

export interface Pages {
  readonly settings: () => void;
  readonly highlights: () => void;
  readonly index: () => void;
  readonly log: () => void;
  readonly proposals: () => void;
  readonly topic: (key: string) => void;
  readonly item: (id: number) => void;
  readonly highlight: (itemId: number, highlightId: number) => void;
  readonly import: () => void;
}

export interface Route {
  readonly openId: number | null;
  readonly navigate: (to: string) => void;
  readonly replace: (to: string) => void;
  readonly leave: () => void;
}

const LIBRARY_PATH = "/";

function pathOf(to: string): string {
  return new URL(to, window.location.origin).pathname;
}

const EntrySchema = z.object({ from: z.string() });

function openedFromLibrary(): boolean {
  const entry = EntrySchema.safeParse(window.history.state);

  return entry.success && entry.data.from === LIBRARY_PATH;
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const update = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", update);

    return () => {
      window.removeEventListener("popstate", update);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({ from: window.location.pathname }, "", to);
    setPath(pathOf(to));
  }, []);

  const replace = useCallback((to: string) => {
    window.history.replaceState(window.history.state, "", to);
    setPath(pathOf(to));
  }, []);

  const closeItem = useCallback(() => {
    if (itemIdOf(window.location.pathname) !== null) replace(LIBRARY_PATH);
  }, [replace]);

  const leave = useCallback(() => {
    if (openedFromLibrary()) {
      window.history.back();
      setPath(LIBRARY_PATH);
    } else {
      replace(LIBRARY_PATH);
    }
  }, [replace]);

  return { path, navigate, replace, leave, closeItem };
}

export function usePages(navigate: Route["navigate"]): Pages {
  return useMemo(
    () => ({
      settings: () => {
        navigate(SETTINGS_PATH);
      },
      highlights: () => {
        navigate(HIGHLIGHTS_PATH);
      },
      index: () => {
        navigate(INDEX_PATH);
      },
      log: () => {
        navigate(LOG_PATH);
      },
      proposals: () => {
        navigate(PROPOSALS_PATH);
      },
      topic: (key) => {
        navigate(topicPath(key));
      },
      item: (id) => {
        navigate(itemPath(id));
      },
      highlight: (itemId, highlightId) => {
        navigate(placePath(itemId, { kind: "highlight", id: highlightId }));
      },
      import: () => {
        navigate(IMPORT_PATH);
      },
    }),
    [navigate],
  );
}

export function useInternalLink(open: () => void) {
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

      if (event.button !== 0 || modified) {
        return;
      }

      event.preventDefault();
      open();
    },
    [open],
  );
}

export function useNavigateLink(navigate: (to: string) => void, to: string) {
  return useInternalLink(
    useCallback(() => {
      navigate(to);
    }, [navigate, to]),
  );
}
