import { useState } from "react";

interface Seen {
  readonly current: string;
  readonly previous: string;
}

export function useArrival(screen: string): boolean {
  const [seen, setSeen] = useState<Seen>({ current: screen, previous: "loading" });

  if (seen.current !== screen) {
    setSeen({ current: screen, previous: seen.current });
  }

  return seen.previous !== "loading" && seen.previous !== seen.current;
}
