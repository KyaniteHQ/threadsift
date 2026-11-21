import { createContext, use, useCallback } from "react";

import { provided } from "./provided.ts";
import { type Route, useInternalLink } from "./routing.ts";

export const NavigateContext = createContext<Route["navigate"] | null>(null);

export function useNavigate(): Route["navigate"] {
  return provided(use(NavigateContext), "useNavigate");
}

export function useNavigateLink(to: string) {
  const navigate = useNavigate();

  return useInternalLink(
    useCallback(() => {
      navigate(to);
    }, [navigate, to]),
  );
}
