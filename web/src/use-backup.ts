import { useCallback, useMemo } from "react";

import type { ExportStatus } from "../../src/core/contract/export-contract.ts";
import { deleteExport, fetchExportStatus, startExport } from "./export-api.ts";
import { EXPORT_TEXT } from "./export-text.ts";
import { usePolling } from "./use-polling.ts";
import type { RestoreRead } from "./use-restore.ts";
import {
  type Outcome,
  type Task,
  outcomeOf,
  useAction,
  useActionFlow,
} from "./use-settings-action.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

type Action = "start" | "stop" | "remove";

const FAILED = {
  start: EXPORT_TEXT.startFailed,
  stop: EXPORT_TEXT.stopFailed,
  remove: EXPORT_TEXT.removeFailed,
} as const satisfies Record<Action, string>;

type Changed = (view: ExportStatus) => void;

function useReader(changed: Changed, ticket: Ticket) {
  return useCallback(async (): Promise<void> => {
    const signal = ticket.take();

    try {
      const view = await fetchExportStatus(signal);

      if (!signal.aborted) changed(view);
    } catch (cause) {
      if (!signal.aborted) throw cause;
    }
  }, [changed, ticket]);
}

const HELD_START: Outcome = { kind: "error", text: EXPORT_TEXT.startRestoring };

async function refreshed(refresh: () => Promise<void>): Promise<Outcome | null> {
  try {
    await refresh();

    return null;
  } catch {
    return { kind: "error", text: EXPORT_TEXT.loadFailed };
  }
}

function startTask(ticket: Ticket, refresh: () => Promise<void>, restoreRead: RestoreRead): Task {
  return async () => {
    ticket.take();

    if ((await startExport()) === "restoring") {
      await restoreRead();

      return HELD_START;
    }

    return refreshed(refresh);
  };
}

function removalTask(ticket: Ticket, refresh: () => Promise<void>): Task {
  return async () => {
    ticket.take();
    await deleteExport();

    return refreshed(refresh);
  };
}

export function useBackup(view: ExportStatus, changed: Changed, restoreRead: RestoreRead) {
  const { flow, run } = useActionFlow<Action>(FAILED);
  const ticket = useTicket();
  const refresh = useReader(changed, ticket);

  usePolling(view.state === "running", async () => {
    if (!document.hidden) await refresh();
  });

  const start = useAction({
    run,
    action: "start",
    task: useMemo(() => startTask(ticket, refresh, restoreRead), [ticket, refresh, restoreRead]),
  });

  const removal = useMemo(() => removalTask(ticket, refresh), [ticket, refresh]);
  const stop = useAction({ run, action: "stop", task: removal });
  const remove = useAction({ run, action: "remove", task: removal });

  return {
    busy: flow.kind === "running" ? flow.action : null,
    result: outcomeOf(flow),
    start,
    stop,
    remove,
  };
}
