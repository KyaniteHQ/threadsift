import { FILE_ROUTE } from "../core/contract/file-keys.ts";
import type { Plan } from "./access-steps.ts";
import type { CacheKind } from "./response-headers.ts";

const FILES_ROOT = FILE_ROUTE.slice(0, -1);

function underFiles(path: string): boolean {
  return path === FILES_ROOT || path.startsWith(FILE_ROUTE);
}

export function unroutedPlan(path: string, routeCache: CacheKind | null): Plan {
  return {
    credentials: "any",
    csrf: "none",
    after: "next",
    cache: underFiles(path) ? "file" : routeCache,
  };
}
