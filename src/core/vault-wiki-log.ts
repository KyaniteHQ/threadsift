import { ZodError } from "zod";

import { plainMarkdown } from "./item-note.ts";
import type { LogEntry } from "./log-contract.ts";
import { readLogEntries } from "./log-page.ts";
import type { Database } from "./ports.ts";
import { logMonthName, logMonthRange } from "./vault-log-month.ts";
import { WIKI_PAGE_ROWS, linesOf, wikiLink } from "./vault-markdown.ts";
import { VaultNoteFailure } from "./vault-queue.ts";
import { VAULT_TEXT } from "./vault-text.ts";

function entryParts(entry: Readonly<LogEntry>): readonly (string | number)[] {
  switch (entry.action) {
    case "ingest":
    case "digest":
      return [entry.action, entry.item.title, entry.topic.name, ...entry.tags];
    case "topic":
      return [entry.action, entry.topic.name];
    case "overview":
      return [entry.action, entry.topic.name, `+${String(entry.added)} −${String(entry.removed)}`];
    case "related":
      return [entry.action, entry.item.title, entry.picks];
    case "merge":
    case "merge-topic":
      return [entry.action, `${entry.from} → ${entry.into}`, entry.items];
    case "vault-file-skipped":
    case "vault-file-conflict":
      return [
        entry.action === "vault-file-conflict" ? VAULT_TEXT.conflict : VAULT_TEXT.skipped,
        entry.path,
      ];
    default:
      return entry satisfies never;
  }
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
