import { type MouseEvent, useCallback, useEffect, useState } from "react";

export const SETTINGS_PATH = "/settings";

export const RESET_PATH = "/reset";

export interface Route {
  readonly openId: number | null;
  readonly navigate: (to: string) => void;
  readonly replace: (to: string) => void;
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
    window.history.pushState(null, "", to);
    setPath(to);
  }, []);

  const replace = useCallback((to: string) => {
    window.history.replaceState(null, "", to);
    setPath(to);
  }, []);

  return { path, navigate, replace };
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
