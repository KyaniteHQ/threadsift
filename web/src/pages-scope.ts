import { createContext } from "react";

import type { Pages } from "./routing.ts";

export const PagesScope = createContext<Pages | null>(null);
