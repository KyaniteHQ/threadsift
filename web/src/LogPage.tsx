import type { LogEntry, LogPage as LogContent } from "../../src/core/contract/log-contract.ts";
import { type Listing, ListPage } from "./ListPage.tsx";
import { localDate } from "./log-date.ts";
import { LOG_PAGE, logEmptyLine, logSince } from "./log-text.ts";
import { LogRow } from "./LogRow.tsx";
import { useLogPage } from "./use-log-page.ts";

const LISTING: Listing<LogContent, LogEntry> = {
  text: LOG_PAGE,
  focus: ".lg-link",
  head: ({ startedAt }) => logSince(localDate(startedAt)),
  emptyLine: ({ startedAt }) => logEmptyLine(localDate(startedAt)),
  rows: ({ entries }) => entries,
};

function draw(entry: LogEntry) {
  return <LogRow key={entry.id} entry={entry} />;
}

export function LogPage() {
  const source = useLogPage();

  return <ListPage source={source} listing={LISTING} draw={draw} />;
}
