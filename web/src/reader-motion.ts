import { useSyncExternalStore } from "react";

import { REDUCED_MOTION } from "./jump-to-comments.ts";

export const READER_MOVE = "reader-move";

function subscribeToMotion(notify: () => void): () => void {
  const query = matchMedia(REDUCED_MOTION);
  query.addEventListener("change", notify);

  return () => {
    query.removeEventListener("change", notify);
  };
}

function motionReduced(): boolean {
  return matchMedia(REDUCED_MOTION).matches;
}

export function useMotionAllowed(): boolean {
  return !useSyncExternalStore(subscribeToMotion, motionReduced);
}
