import { useCallback } from "react";

import type { LogEntry, LogPage as LogContent } from "../../src/core/log-contract.ts";
import { type Listing, ListPage } from "./ListPage.tsx";
import { localDate } from "./log-date.ts";
import { LOG_PAGE, logEmptyLine, logSince } from "./log-text.ts";
import { LogRow } from "./LogRow.tsx";
import type { Pages } from "./routing.ts";
import { useLogPage } from "./use-log-page.ts";

const LISTING: Listing<LogContent, LogEntry> = {
  text: LOG_PAGE,
  focus: ".lg-link",
  head: ({ startedAt }) => logSince(localDate(startedAt)),
  emptyLine: ({ startedAt }) => logEmptyLine(localDate(startedAt)),
  rows: ({ entries }) => entries,
};

export function LogPage({ pages, back }: Readonly<{ pages: Pages; back: () => void }>) {
  const source = useLogPage();

  const draw = useCallback(
    (entry: LogEntry) => <LogRow key={entry.id} entry={entry} pages={pages} />,
    [pages],
  );

  return <ListPage source={source} listing={LISTING} draw={draw} back={back} />;
}
