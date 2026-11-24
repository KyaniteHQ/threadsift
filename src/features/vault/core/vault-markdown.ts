import { collapsed } from "../../../core/contract/format.ts";
import { VAULT_TEXT } from "../../../core/contract/vault-text.ts";
import { plainMarkdown, yamlScalar } from "../../../core/kernel/markdown-escape.ts";
import type { VaultSubject } from "../../../core/kernel/vault-tables.ts";
import { vaultNotePath } from "./vault-paths.ts";

export function wikiLink(subject: VaultSubject, label: string | null): string {
  const path = vaultNotePath(subject).slice(0, -".md".length);
  const text =
    label?.replaceAll(/\p{Cc}/gu, " ").replaceAll(/(\[(?=\[)|\](?=\]|$))/gu, "$1\u2060") ?? "";

  return text === "" ? `[[${path}]]` : `[[${path}|${text}]]`;
}

export function itemWikiLink({ id, title }: Readonly<{ id: number; title: string | null }>) {
  return wikiLink({ kind: "item", subjectId: id }, title);
}

interface ItemLinks {
  readonly topicId: number | null;
  readonly item: Readonly<{
    digestTopic: string | null;
    related: readonly Readonly<{ id: number; title: string | null; reason: string }>[];
  }>;
}

export function itemWikiSections({ item, topicId }: ItemLinks) {
  const topic =
    topicId === null
      ? []
      : [
          `## ${VAULT_TEXT.topicHeading}`,
          "",
          wikiLink({ kind: "topic", subjectId: topicId }, item.digestTopic),
        ];
  const related =
    item.related.length === 0
      ? []
      : [
          `## ${VAULT_TEXT.relatedHeading}`,
          "",
          ...item.related.map(
            (other) => `- ${itemWikiLink(other)} · ${plainMarkdown(other.reason)}`,
          ),
        ];

  return [topic, related].flatMap((lines) => (lines.length === 0 ? [] : lines.concat("")));
}

export function topicWikiHeader({
  name,
  overview,
}: Readonly<{ name: string; overview: string | null }>) {
  const heading = `---\naliases: [${yamlScalar(name)}]\n---\n\n# ${plainMarkdown(collapsed(name))}\n`;

  return overview === null ? heading : `${heading}\n${plainMarkdown(overview)}\n`;
}

export const WIKI_PAGE_ROWS = 500;

export async function* linesOf<Row, Cursor>(
  read: (cursor: Cursor | null) => PromiseLike<readonly Row[]>,
  line: (row: Row) => string,
  after: (row: Row) => Cursor,
  heading?: string,
): AsyncGenerator<string> {
  let cursor: Cursor | null = null;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each page starts at the cursor the previous page returned.
    const rows = await read(cursor);
    if (cursor === null && heading !== undefined && rows.length > 0) yield heading;
    yield* rows.map((row) => line(row));

    const last = rows.at(-1);
    if (rows.length < WIKI_PAGE_ROWS || last === undefined) return;

    cursor = after(last);
  }
}
