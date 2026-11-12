import { useEffect } from "react";

import { topicPath } from "../../src/core/topic-path.ts";
import type { Route } from "./routing.ts";

export function useSurvivorAddress(
  answeredKey: string | null,
  topicKey: string,
  replace: Route["replace"],
) {
  useEffect(() => {
    if (answeredKey !== null && answeredKey !== topicKey) replace(topicPath(answeredKey));
  }, [answeredKey, replace, topicKey]);
}
