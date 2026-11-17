import { type MouseEvent, useCallback, useEffect, useMemo, useRef } from "react";
import { z } from "zod";

import { itemIdOf, itemPath } from "../../src/core/item-path.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { placePath } from "./place.ts";
import { useScreenState } from "./use-screen-state.ts";

export const SETTINGS_PATH = "/settings";

export const OBSIDIAN_PATH = "/settings/obsidian";

export const HIGHLIGHTS_PATH = "/highlights";

export const IMPORT_PATH = "/import";

export const INDEX_PATH = "/topics";

export const LOG_PATH = "/log";

export const PROPOSALS_PATH = "/proposals";

export const RESET_PATH = "/reset";

export interface Pages {
  readonly settings: () => void;
  readonly obsidian: () => void;
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

const TRAVERSAL_WAIT_MS = 1000;

interface Leaving {
  readonly address: string;
  readonly at: number;
}

function waiting(leaving: Leaving | null): leaving is Leaving {
  return leaving !== null && performance.now() - leaving.at < TRAVERSAL_WAIT_MS;
}

export function onItem(): boolean {
  return itemIdOf(window.location.pathname) !== null;
}

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

function useClosing(replace: Route["replace"], setPath: (path: string) => void) {
  const leaving = useRef<Leaving | null>(null);

  const arrive = useCallback(
    (arrived: string) => {
      const wasLeaving = waiting(leaving.current);
      leaving.current = null;

      if (wasLeaving && itemIdOf(arrived) !== null) replace(LIBRARY_PATH);
      else setPath(arrived);
    },
    [replace, setPath],
  );

  const closeItem = useCallback(() => {
    if (onItem()) replace(LIBRARY_PATH);
  }, [replace]);

  const leave = useCallback(() => {
    const pending = leaving.current;

    if (!onItem() || (waiting(pending) && pending.address === window.location.href)) return;

    if (openedFromLibrary()) {
      leaving.current = { address: window.location.href, at: performance.now() };
      window.history.back();
      setPath(LIBRARY_PATH);
    } else {
      replace(LIBRARY_PATH);
    }
  }, [replace, setPath]);

  return { arrive, closeItem, leave };
}

export function usePath() {
  const [path, setPath] = useScreenState(window.location.pathname);

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

  const { arrive, closeItem, leave } = useClosing(replace, setPath);

  usePopstate(arrive);

  return { path, navigate, replace, leave, closeItem };
}

export function usePages(navigate: Route["navigate"]): Pages {
  return useMemo(
    () => ({
      obsidian: () => {
        navigate(OBSIDIAN_PATH);
      },
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
