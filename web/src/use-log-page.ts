import { type LogPage, LogPageSchema } from "../../src/core/log-contract.ts";
import { parsedFrom, withCursor } from "./calls.ts";
import { usePagedRead } from "./use-paged-read.ts";

function fetchLog(cursor: string | null): Promise<LogPage> {
  return parsedFrom("GET", withCursor("/api/log", cursor), LogPageSchema);
}

function withMoreEntries(shown: Readonly<LogPage>, added: Readonly<LogPage>): LogPage {
  return { ...added, entries: [...shown.entries, ...added.entries] };
}

export function useLogPage() {
  return usePagedRead(fetchLog, withMoreEntries);
}
