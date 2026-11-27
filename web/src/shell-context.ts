import { createContext, use } from "react";

import { provided } from "./provided.ts";
import type { Look } from "./use-root.ts";

export type Place = "library" | "index" | "highlights" | "proposals" | "log";

export interface Shell {
  readonly look: Look;
  readonly place: Place | null;
  readonly path: string;
  readonly signOut: () => void;
}

export const ShellContext = createContext<Shell | null>(null);

export function useShell(): Shell {
  return provided(use(ShellContext), "useShell");
}
