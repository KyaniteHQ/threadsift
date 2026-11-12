import { type MouseEvent, useCallback, useEffect, useMemo } from "react";
import { z } from "zod";

import { itemIdOf, itemPath } from "../../src/core/item-path.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { placePath } from "./place.ts";
import { useScreenState } from "./use-screen-state.ts";

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
  readonly path: string;
  readonly openId: number | null;
  readonly navigate: (to: string) => void;
  readonly replace: (to: string) => void;
  readonly leave: () => void;
}

const LIBRARY_PATH = "/";

function pathOf(to: string): string {
  return new URL(to, window.location.origin).pathname;
}

function addressOf(to: string): string {
  const { pathname, search, hash } = new URL(to, window.location.origin);

  return `${pathname}${search}${hash}`;
}

const EntrySchema = z.object({ from: z.string() });

function openedFromLibrary(): boolean {
  const entry = EntrySchema.safeParse(window.history.state);

  return entry.success && entry.data.from === LIBRARY_PATH;
}

function usePopstate(show: (path: string) => void): void {
  useEffect(() => {
    let pending: number | undefined;

    const update = () => {
      window.clearTimeout(pending);
      // React renders a transition that starts inside a popstate event synchronously, which shows a Suspense fallback: https://github.com/react/react/blob/v19.3.1/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L788
      pending = window.setTimeout(() => {
        show(window.location.pathname);
      }, 0);
    };

    window.addEventListener("popstate", update);

    return () => {
      window.clearTimeout(pending);
      window.removeEventListener("popstate", update);
    };
  }, [show]);
}

export function usePath() {
  const [path, setPath] = useScreenState(window.location.pathname);

  usePopstate(setPath);

  const navigate = useCallback(
    (to: string) => {
      if (addressOf(to) === addressOf(window.location.href)) return;

      window.history.pushState({ from: window.location.pathname }, "", to);
      setPath(pathOf(to));
    },
    [setPath],
  );

  const replace = useCallback(
    (to: string) => {
      window.history.replaceState(window.history.state, "", to);
      setPath(pathOf(to));
    },
    [setPath],
  );

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
  }, [replace, setPath]);

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
