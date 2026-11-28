import { createContext } from "react";

import type { SaveTarget } from "./api.ts";

export const RefusedRetryContext = createContext<SaveTarget["kind"] | null>(null);
