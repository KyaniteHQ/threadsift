import { useState } from "react";

import type { ScreenName } from "./screens.ts";

interface Seen {
  readonly current: ScreenName;
  readonly previous: ScreenName;
}

export function useArrival(screen: ScreenName): boolean {
  const [seen, setSeen] = useState<Seen>({ current: screen, previous: "loading" });

  if (seen.current !== screen) {
    setSeen({ current: screen, previous: seen.current });
  }

  return seen.previous !== "loading" && seen.previous !== seen.current;
}
