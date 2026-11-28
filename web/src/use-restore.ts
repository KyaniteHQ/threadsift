import { type RefObject, useCallback, useEffect, useState } from "react";

import type { RestoreStatus } from "../../src/core/contract/restore-contract.ts";
import { useDatabase, useDatabaseRecheck } from "./database-context.ts";
import { cancelRestore, fetchRestoreStatus, resumeRestore } from "./restore-api.ts";
import { RESTORE_TEXT } from "./restore-text.ts";
import { type Progress, type StatusRead, uploadZip } from "./restore-upload.ts";
import { useLatest } from "./use-latest.ts";
import { usePolling } from "./use-polling.ts";
import { type RunAction, outcomeOf, runningAction, useActionFlow } from "./use-settings-action.ts";
import { useTicket } from "./use-ticket.ts";

const SUPERSEDED: StatusRead = { kind: "superseded" };

function useStatus() {
  const [view, setView] = useState<RestoreStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const ticket = useTicket();

  const refresh = useCallback(async (): Promise<StatusRead> => {
    const signal = ticket.take();

    try {
      const next = await fetchRestoreStatus(signal);

      if (signal.aborted) return SUPERSEDED;

      setView(next);
      setLoadFailed(false);

      return { kind: "read", view: next };
    } catch {
      if (signal.aborted) return SUPERSEDED;

      setLoadFailed(true);

      return { kind: "failed" };
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

function useRecheckAfterRestore(view: RestoreStatus | null) {
  const recheck = useDatabaseRecheck();
  const finished = view?.state === "done" ? view.id : null;

  useEffect(() => {
    if (finished !== null) recheck();
  }, [finished, recheck]);
}

type Action = "choose" | "cancel" | "resume";

const FAILED = {
  choose: RESTORE_TEXT.failed,
  cancel: RESTORE_TEXT.cancelFailed,
  resume: RESTORE_TEXT.resumeFailed,
} as const satisfies Record<Action, string>;

function useEnding(
  latest: Readonly<RefObject<RestoreStatus | null>>,
  refresh: () => Promise<StatusRead>,
  run: RunAction<Action>,
) {
  const end = useCallback(
    (action: "cancel" | "resume", request: (id: number) => Promise<void>) => {
      const current = latest.current;

      if (current === null || current.state === "none" || current.state === "done") return;

      const { id } = current;

      void run(action, async () => {
        await request(id);
        const next = await refresh();

        return next.kind === "failed" ? { kind: "error", text: RESTORE_TEXT.loadFailed } : null;
      });
    },
    [latest, refresh, run],
  );

  const cancel = useCallback(() => {
    end("cancel", cancelRestore);
  }, [end]);

  const resume = useCallback(() => {
    end("resume", resumeRestore);
  }, [end]);

  return { cancel, resume };
}

export function useRestore() {
  const { view, loadFailed, refresh } = useStatus();
  const [progress, setProgress] = useState<Progress | null>(null);
  const { flow, run } = useActionFlow<Action>(FAILED);
  const latest = useLatest(view);
  const { cancel, resume } = useEnding(latest, refresh, run);
  const database = useDatabase();

  useRecheckAfterRestore(view);

  const choose = useCallback(
    (file: Readonly<File>) => {
      const upload = async () => {
        try {
          return await uploadZip(database, file, latest.current, {
            progress: setProgress,
            refresh,
          });
        } finally {
          setProgress(null);
        }
      };

      void run("choose", upload);
    },
    [database, latest, refresh, run],
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
