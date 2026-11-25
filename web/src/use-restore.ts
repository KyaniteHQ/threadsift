import { type RefObject, useCallback, useEffect, useState } from "react";

import type { RestoreStatus } from "../../src/core/contract/restore-contract.ts";
import { cancelRestore, fetchRestoreStatus, resumeRestore } from "./restore-api.ts";
import { RESTORE_TEXT } from "./restore-text.ts";
import { type Progress, uploadZip } from "./restore-upload.ts";
import { useLatest } from "./use-latest.ts";
import { usePolling } from "./use-polling.ts";
import { type RunAction, outcomeOf, runningAction, useActionFlow } from "./use-settings-action.ts";
import { useTicket } from "./use-ticket.ts";

function useStatus() {
  const [view, setView] = useState<RestoreStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const ticket = useTicket();

  const refresh = useCallback(async (): Promise<RestoreStatus | null> => {
    const signal = ticket.take();

    try {
      const next = await fetchRestoreStatus(signal);

      if (signal.aborted) return null;

      setView(next);
      setLoadFailed(false);

      return next;
    } catch {
      if (!signal.aborted) setLoadFailed(true);

      return null;
    }
  }, [ticket]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      await refresh();
    };

    void load();
  }, [refresh]);

  usePolling(view?.state === "running" || view?.state === "cancelling", async () => {
    if (!document.hidden) await refresh();
  });

  return { view, loadFailed: view === null && loadFailed, refresh };
}

type Action = "choose" | "cancel" | "resume";

function useEnding(
  latest: Readonly<RefObject<RestoreStatus | null>>,
  refresh: () => Promise<RestoreStatus | null>,
  run: RunAction<Action>,
) {
  const end = useCallback(
    (action: "cancel" | "resume", request: (id: number) => Promise<void>, failed: string) => {
      const current = latest.current;

      if (current === null || current.state === "none" || current.state === "done") return;

      const { id } = current;

      void run(action, async () => {
        try {
          await request(id);
          await refresh();

          return null;
        } catch {
          return { kind: "error", text: failed };
        }
      });
    },
    [latest, refresh, run],
  );

  const cancel = useCallback(() => {
    end("cancel", cancelRestore, RESTORE_TEXT.cancelFailed);
  }, [end]);

  const resume = useCallback(() => {
    end("resume", resumeRestore, RESTORE_TEXT.resumeFailed);
  }, [end]);

  return { cancel, resume };
}

export function useRestore() {
  const { view, loadFailed, refresh } = useStatus();
  const [progress, setProgress] = useState<Progress | null>(null);
  const { flow, run } = useActionFlow<Action>(RESTORE_TEXT.failed);
  const latest = useLatest(view);
  const { cancel, resume } = useEnding(latest, refresh, run);

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
    acting: runningAction(flow),
    result: outcomeOf(flow),
    choose,
    cancel,
    resume,
  };
}
