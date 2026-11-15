import { useCallback, useEffect, useState } from "react";

import type { RestoreStatus } from "../../src/core/restore-contract.ts";
import { fetchRestoreStatus } from "./restore-api.ts";
import { RESTORE_TEXT } from "./restore-text.ts";
import { type Progress, uploadZip } from "./restore-upload.ts";
import { useLatest } from "./use-latest.ts";
import { usePolling } from "./use-polling.ts";
import { outcomeOf, runningAction, useActionFlow } from "./use-settings-action.ts";
import { useTicket } from "./use-ticket.ts";

function useStatus() {
  const [view, setView] = useState<RestoreStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const ticket = useTicket();

  const refresh = useCallback(
    async (signal?: AbortSignal): Promise<RestoreStatus | null> => {
      const mine = ticket.take();

      try {
        const next = await fetchRestoreStatus(signal);

        if (!ticket.matches(mine)) return null;

        setView(next);
        setLoadFailed(false);

        return next;
      } catch {
        if (ticket.matches(mine)) setLoadFailed(true);

        return null;
      }
    },
    [ticket],
  );

  useEffect(() => {
    const controller = new AbortController();

    const load = async (): Promise<void> => {
      await refresh(controller.signal);
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [refresh]);

  usePolling(view?.state === "running", async () => {
    if (!document.hidden) await refresh();
  });

  return { view, loadFailed: view === null && loadFailed, refresh };
}

export function useRestore() {
  const { view, loadFailed, refresh } = useStatus();
  const [progress, setProgress] = useState<Progress | null>(null);
  const { flow, run } = useActionFlow<"choose">(RESTORE_TEXT.failed);
  const latest = useLatest(view);

  const choose = useCallback(
    (file: Readonly<File>) => {
      const upload = async () => {
        try {
          return await uploadZip(file, latest.current, { progress: setProgress, refresh });
        } finally {
          setProgress(null);
        }
      };

      void run("choose", upload);
    },
    [latest, refresh, run],
  );

  return {
    view,
    loadFailed,
    progress,
    busy: runningAction(flow) !== null,
    result: outcomeOf(flow),
    choose,
  };
}
