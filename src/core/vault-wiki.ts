import type { Database } from "./database.ts";
import { utf8Length } from "./encoding.ts";
import { VAULT_FILE_BYTES } from "./vault-contract.ts";
import { VaultNoteFailure } from "./vault-note-failure.ts";
import type { VaultSubject } from "./vault-tables.ts";
import { logLines, logMonthLines } from "./vault-wiki-log.ts";
import { indexLines, topicLines } from "./vault-wiki-topics.ts";

type WikiSubject = Readonly<{ kind: Exclude<VaultSubject["kind"], "item">; subjectId: number }>;

type LoadMonths = () => Promise<readonly number[]>;

function wikiLines(db: Database, subject: WikiSubject, months: LoadMonths): AsyncGenerator<string> {
  switch (subject.kind) {
    case "topic":
      return topicLines(db, subject.subjectId);
    case "index":
      return indexLines(db);
    case "log":
      return logLines(months);
    case "log-month":
      return logMonthLines(db, subject.subjectId);
    default:
      return subject.kind satisfies never;
  }
}

type WikiContent = Readonly<{ kind: "memory"; bytes: Uint8Array }> | Readonly<{ kind: "missing" }>;

export async function vaultWikiContent(
  db: Database,
  subject: WikiSubject,
  signal: AbortSignal,
  months: LoadMonths,
): Promise<WikiContent> {
  let bytes = 0;
  const parts: string[] = [];

  for await (const line of wikiLines(db, subject, months)) {
    signal.throwIfAborted();
    bytes += utf8Length(line);
    if (bytes > VAULT_FILE_BYTES) throw new VaultNoteFailure("file-too-large");
    parts.push(line);
  }

  return bytes === 0
    ? { kind: "missing" }
    : { kind: "memory", bytes: new TextEncoder().encode(parts.join("")) };
}
