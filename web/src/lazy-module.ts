import { type ComponentType, lazy } from "react";

import { unavailable } from "./module-unavailable.ts";

export function lazyModule<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  return lazy(() => load().then((component) => ({ default: component }), unavailable));
}
