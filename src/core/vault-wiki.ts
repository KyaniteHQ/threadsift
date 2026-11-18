import { utf8Length } from "./encoding.ts";
import { plainMarkdown } from "./item-note.ts";
import type { LogEntry } from "./log-contract.ts";
import { readLogEntries } from "./log-page.ts";
import type { Database } from "./ports.ts";
import { GITHUB_FILE_BYTES, VAULT_FILE_BYTES } from "./vault-contract.ts";
import { WIKI_PAGE_ROWS, linesOf } from "./vault-markdown.ts";
import { VaultNoteFailure } from "./vault-queue.ts";
import type { VaultSubject } from "./vault-tables.ts";
import { VAULT_TEXT } from "./vault-text.ts";
import { indexLines, topicLines } from "./vault-wiki-topics.ts";

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
      return [VAULT_TEXT.skipped, entry.path];
    default:
      return entry satisfies never;
  }
}

async function* logLines(db: Database): AsyncGenerator<string> {
  yield `# ${VAULT_TEXT.logHeading}\n\n`;
  yield* linesOf(
    (cursor: number | null) => readLogEntries(db, cursor, WIKI_PAGE_ROWS),
    (entry) =>
      `- ${new Date(entry.at).toISOString()} · ${entryParts(entry)
        .map((part) => plainMarkdown(String(part)))
        .join(" · ")}\n`,
    ({ id }) => id,
  );
}

type WikiSubject = Readonly<{ kind: Exclude<VaultSubject["kind"], "item">; subjectId: number }>;

function wikiLines(db: Database, subject: WikiSubject): AsyncGenerator<string> {
  switch (subject.kind) {
    case "topic":
      return topicLines(db, subject.subjectId);
    case "index":
      return indexLines(db);
    case "log":
      return logLines(db);
    default:
      return subject.kind satisfies never;
  }
}

type WikiContent =
  | Readonly<{ kind: "memory"; bytes: Uint8Array }>
  | Readonly<{ kind: "missing" | "oversized" }>;

export async function vaultWikiContent(
  db: Database,
  subject: WikiSubject,
  signal: AbortSignal,
): Promise<WikiContent> {
  let bytes = 0;
  const parts: string[] = [];

  for await (const line of wikiLines(db, subject)) {
    signal.throwIfAborted();
    bytes += utf8Length(line);
    if (bytes > GITHUB_FILE_BYTES) return { kind: "oversized" };
    if (bytes <= VAULT_FILE_BYTES) parts.push(line);
  }

  if (bytes > VAULT_FILE_BYTES) throw new VaultNoteFailure("file-too-large");

  return bytes === 0
    ? { kind: "missing" }
    : { kind: "memory", bytes: new TextEncoder().encode(parts.join("")) };
}
