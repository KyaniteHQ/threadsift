import type { LogPage } from "../../src/core/log-contract.ts";
import { fetchLog } from "./log-api.ts";
import { type Paged, type PagedReady, usePagedRead } from "./use-paged-read.ts";

export type LogReady = PagedReady<LogPage>;

export type LogState = Paged<LogPage>;

function withMoreEntries(shown: Readonly<LogPage>, added: Readonly<LogPage>): LogPage {
  return { ...added, entries: [...shown.entries, ...added.entries] };
}

export function useLogPage() {
  return usePagedRead(fetchLog, withMoreEntries);
}
