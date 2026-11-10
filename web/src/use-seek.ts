import { useCallback, useEffect, useRef, useState } from "react";

import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";

type Step = "wait" | "read" | "show" | "stop";

function stepOf(
  list: Readonly<ListState>,
  id: number,
  unfiltered: boolean,
  failedAt: string | null,
): Step {
  if (list.status === "failed" || !list.known.some((item) => item.id === id)) return "stop";

  if (list.status === "loading") return "wait";

  if (list.items.some((item) => item.id === id)) return "show";

  if (!unfiltered || list.next === null) return "stop";

  if (list.more === "loading") return "wait";

  return list.more === "failed" && failedAt === list.next ? "stop" : "read";
}

export function useSeek(
  list: Readonly<ListState>,
  unfiltered: boolean,
  more: () => void,
  attend: (attention: Attention) => void,
) {
  const [seeking, setSeeking] = useState<number | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (seeking === null) return;

    const step = stepOf(list, seeking, unfiltered, asked.current);

    if (step === "wait") return;

    if (step === "read") {
      asked.current = list.status === "ready" ? list.next : null;
      more();

      return;
    }

    if (step === "show") attend({ id: seeking, focus: false });

    setSeeking(null);
  }, [attend, list, more, seeking, unfiltered]);

  return useCallback((id: number) => {
    asked.current = null;
    setSeeking(id);
  }, []);
}
