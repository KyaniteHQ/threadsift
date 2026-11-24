import { useCallback, useMemo } from "react";

import type { ExportStatus } from "../../src/core/contract/export-contract.ts";
import { deleteExport, fetchExportStatus, startExport } from "./export-api.ts";
import { EXPORT_TEXT } from "./export-text.ts";
import { usePolling } from "./use-polling.ts";
import { type Task, outcomeOf, useAction, useActionFlow } from "./use-settings-action.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

type Action = "start" | "remove";

type Changed = (view: ExportStatus) => void;

function useReader(changed: Changed, ticket: Ticket) {
  return useCallback(async (): Promise<void> => {
    const mine = ticket.take();

    const view = await fetchExportStatus();

    if (ticket.matches(mine)) changed(view);
  }, [changed, ticket]);
}

function settled(call: () => Promise<void>, ticket: Ticket, refresh: () => Promise<void>): Task {
  return async () => {
    ticket.take();
    await call();

    try {
      await refresh();

      return null;
    } catch {
      return { kind: "error", text: EXPORT_TEXT.loadFailed };
    }
  };
}

export function useBackup(view: ExportStatus, changed: Changed) {
  const { flow, run } = useActionFlow<Action>(EXPORT_TEXT.failed);
  const ticket = useTicket();
  const refresh = useReader(changed, ticket);

  usePolling(view.state === "running", async () => {
    if (!document.hidden) await refresh();
  });

  const start = useAction({
    run,
    action: "start",
    unavailable: null,
    task: useMemo(() => settled(startExport, ticket, refresh), [ticket, refresh]),
  });

  const remove = useAction({
    run,
    action: "remove",
    unavailable: null,
    task: useMemo(() => settled(deleteExport, ticket, refresh), [ticket, refresh]),
  });

  return {
    busy: flow.kind === "running" ? flow.action : null,
    result: outcomeOf(flow),
    start,
    remove,
  };
}
