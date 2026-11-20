import { ZodError } from "zod";

import { LOG } from "../../../core/contract/log-actions.ts";
import type { LogEntry } from "../../../core/contract/log-contract.ts";
import { VaultNoteFailure } from "../../../core/contract/vault-note-failure.ts";
import { VAULT_TEXT } from "../../../core/contract/vault-text.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { logMonthName, logMonthRange } from "../../../core/kernel/vault-log-month.ts";
import { plainMarkdown } from "../../media/core/markdown-escape.ts";
import { readLogEntries } from "../../wiki/core/log-page.ts";
import { WIKI_PAGE_ROWS, linesOf, wikiLink } from "./vault-markdown.ts";

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
