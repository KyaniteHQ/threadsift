import { type LogPage, LogPageSchema } from "../../src/core/contract/log-contract.ts";
import { parsedFrom, withCursor } from "./calls.ts";
import { samePages, usePagedRead } from "./use-paged-read.ts";

function fetchLog(cursor: string | null, signal: AbortSignal): Promise<LogPage> {
  return parsedFrom("GET", withCursor("/api/log", cursor), LogPageSchema, { signal });
}

const LOG_READS = samePages(fetchLog);

function withMoreEntries(shown: Readonly<LogPage>, added: Readonly<LogPage>): LogPage {
  return { ...added, entries: [...shown.entries, ...added.entries] };
}

export function useLogPage() {
  return usePagedRead(LOG_READS, withMoreEntries);
}
