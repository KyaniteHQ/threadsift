import { createContext, use } from "react";

import { provided } from "./provided.ts";
import type { Route } from "./routing.ts";

export const NavigateContext = createContext<Route["navigate"] | null>(null);

export function useNavigate(): Route["navigate"] {
  return provided(use(NavigateContext), "useNavigate");
}
