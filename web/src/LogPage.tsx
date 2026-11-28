import type { LogEntry, LogPage as LogContent } from "../../src/core/contract/log-contract.ts";
import { type FrameProps, type Listing, ListPage } from "./ListPage.tsx";
import { localDate } from "./log-date.ts";
import { LOG_COLUMNS, LOG_PAGE, logEmptyLine, logSince } from "./log-text.ts";
import { LogRow } from "./LogRow.tsx";
import { useLogPage } from "./use-log-page.ts";

const LISTING: Listing<LogContent, LogEntry> = {
  text: LOG_PAGE,
  focus: '.lg-link, .lg-subject[tabindex="-1"]',
  rowSelector: "tr.lg-row",
  head: ({ startedAt }) => logSince(localDate(startedAt)),
  emptyLine: ({ startedAt }) => logEmptyLine(localDate(startedAt)),
  emptyLink: () => "library",
  rows: ({ entries }) => entries,
};

interface Day {
  readonly date: string;
  readonly entries: readonly LogEntry[];
}

function daysOf(entries: readonly LogEntry[]): readonly Day[] {
  const days: { date: string; entries: LogEntry[] }[] = [];

  for (const entry of entries) {
    const date = localDate(entry.at);
    const last = days.at(-1);

    if (last?.date === date) last.entries.push(entry);
    else days.push({ date, entries: [entry] });
  }

  return days;
}

function LogTable({ rows, listRef }: Readonly<FrameProps<LogEntry>>) {
  return (
    <table ref={listRef} className="lg-table">
      <caption className="vh">{LOG_PAGE.title}</caption>
      <thead>
        <tr>
          <th scope="col" className="label">
            {LOG_COLUMNS.time}
          </th>
          <th scope="col" className="label">
            {LOG_COLUMNS.change}
          </th>
          <th scope="col" className="label">
            {LOG_COLUMNS.subject}
          </th>
          <th scope="col" className="label">
            {LOG_COLUMNS.details}
          </th>
        </tr>
      </thead>
      {daysOf(rows).map(({ date, entries }) => (
        <tbody key={date}>
          <tr className="lg-day">
            <th scope="rowgroup" colSpan={4}>
              <h3>{date}</h3>
            </th>
          </tr>
          {entries.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </tbody>
      ))}
    </table>
  );
}

export function LogPage() {
  const source = useLogPage();

  return <ListPage source={source} listing={LISTING} Frame={LogTable} />;
}
