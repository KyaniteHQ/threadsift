import { useCallback, useEffect, useMemo, useState } from "react";

import { EXPORT_KEEP_MS, type ExportStatus } from "../../src/core/export-contract.ts";
import { deleteExport, fetchExportStatus, startExport } from "./export-api.ts";
import { EXPORT_TEXT } from "./export-text.ts";
import { POLL_MS } from "./poll-interval.ts";
import { useLatest } from "./use-latest.ts";
import { usePolling } from "./use-polling.ts";
import { type Task, outcomeOf, useAction, useActionFlow } from "./use-settings-action.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

type Action = "start" | "remove";

type Changed = (view: ExportStatus) => void;

const STALE_AFTER_FAILURES = 3;

const SLOW_POLL_MS = 5 * POLL_MS;

function useReader(changed: Changed, ticket: Ticket) {
  const [failures, setFailures] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    const mine = ticket.take();

    try {
      const view = await fetchExportStatus();

      if (!ticket.matches(mine)) return;

      setFailures(0);
      changed(view);
    } catch {
      if (ticket.matches(mine)) setFailures((count) => count + 1);
    }
  }, [changed, ticket]);

  return { failures, refresh };
}

function wakeOnReturn(wake: () => void, expiresAt: number | null): () => void {
  const timer =
    expiresAt === null ? null : window.setTimeout(wake, Math.max(expiresAt - Date.now(), 0));

  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);

  return () => {
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);

    if (timer !== null) window.clearTimeout(timer);
  };
}

function useWakeOnReturn(view: ExportStatus, refresh: () => Promise<void>): void {
  const latest = useLatest(refresh);
  const watched = view.state === "running" || view.state === "ready";
  const expiresAt = view.state === "ready" ? view.finishedAt + EXPORT_KEEP_MS : null;

  useEffect(
    () =>
      watched
        ? wakeOnReturn(() => {
            if (!document.hidden) void latest.current();
          }, expiresAt)
        : undefined,
    [watched, expiresAt, latest],
  );
}

function settled(call: () => Promise<void>, ticket: Ticket, refresh: () => Promise<void>): Task {
  return async () => {
    ticket.take();
    await call();
    await refresh();

    return null;
  };
}

export function useBackup(view: ExportStatus, changed: Changed) {
  const { flow, run } = useActionFlow<Action>(EXPORT_TEXT.failed);
  const ticket = useTicket();
  const { failures, refresh } = useReader(changed, ticket);
  const retrying = failures > 0;
  const stale = failures >= STALE_AFTER_FAILURES;

  usePolling(
    view.state === "running" || retrying,
    () => (document.hidden ? Promise.resolve() : refresh()),
    stale ? SLOW_POLL_MS : POLL_MS,
  );

  useWakeOnReturn(view, refresh);

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
    stale,
    start,
    remove,
  };
}
