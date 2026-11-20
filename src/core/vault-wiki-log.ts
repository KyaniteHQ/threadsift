import { ZodError } from "zod";

import type { Database } from "./database.ts";
import { LOG } from "./log-actions.ts";
import type { LogEntry } from "./log-contract.ts";
import { readLogEntries } from "./log-page.ts";
import { plainMarkdown } from "./markdown-escape.ts";
import { logMonthName, logMonthRange } from "./vault-log-month.ts";
import { WIKI_PAGE_ROWS, linesOf, wikiLink } from "./vault-markdown.ts";
import { VaultNoteFailure } from "./vault-note-failure.ts";
import { VAULT_TEXT } from "./vault-text.ts";

function entryParts(entry: Readonly<LogEntry>): readonly (string | number)[] {
  return [
    LOG[entry.action].word,
    ...("item" in entry ? [entry.item.title] : []),
    ...("topic" in entry ? [entry.topic.name] : []),
    ...("tags" in entry ? entry.tags : []),
    ...("added" in entry ? [`+${String(entry.added)} −${String(entry.removed)}`] : []),
    ...("picks" in entry ? [entry.picks] : []),
    ...("from" in entry ? [`${entry.from} → ${entry.into}`, entry.items] : []),
    ...("path" in entry ? [entry.path] : []),
  ];
}

export async function* logLines(months: () => Promise<readonly number[]>): AsyncGenerator<string> {
  yield `# ${VAULT_TEXT.logHeading}\n\n`;
  for (const subjectId of (await months()).toSorted((first, second) => second - first)) {
    yield `- ${wikiLink({ kind: "log-month", subjectId }, logMonthName(subjectId))}\n`;
  }
}

async function monthEntries(db: Database, cursor: number | null, month: number) {
  try {
    return await readLogEntries(db, cursor, WIKI_PAGE_ROWS, logMonthRange(month));
  } catch (error) {
    if (error instanceof ZodError) throw new VaultNoteFailure("log-unreadable");
    throw error;
  }
}

export function logMonthLines(db: Database, month: number): AsyncGenerator<string> {
  return linesOf(
    (cursor: number | null) => monthEntries(db, cursor, month),
    (entry) =>
      `- ${new Date(entry.at).toISOString()} · ${entryParts(entry)
        .map((part) => plainMarkdown(String(part)))
        .join(" · ")}\n`,
    ({ id }) => id,
    `# ${VAULT_TEXT.logHeading} · ${logMonthName(month)}\n\n`,
  );
}
