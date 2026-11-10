import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { itemIdOf } from "../../src/core/item-path.ts";

export const SETTINGS_PATH = "/settings";

export const HIGHLIGHTS_PATH = "/highlights";

export const RESET_PATH = "/reset";

export interface Pages {
  readonly settings: () => void;
  readonly highlights: () => void;
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
