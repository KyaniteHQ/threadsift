import { and, asc, eq, gt } from "drizzle-orm";

import { overviewLine } from "../contract/topic-overview-contract.ts";
import { VAULT_TEXT } from "../contract/vault-text.ts";
import type { Database } from "../kernel/database.ts";
import { itemTitle } from "../kernel/item-title.ts";
import { digests, items, topicPages, topics } from "../kernel/schema.ts";
import { plainMarkdown } from "../media/markdown-escape.ts";
import { disagreementPage } from "../wiki/known-disagreements.ts";
import { topicIndexRows } from "../wiki/topic-index.ts";
import {
  WIKI_PAGE_ROWS,
  itemWikiLink,
  linesOf,
  topicWikiHeader,
  wikiLink,
} from "./vault-markdown.ts";

function topicItems(db: Database, topicId: number, cursor: number | null) {
  return db
    .select({ id: items.id, title: itemTitle() })
    .from(items)
    .leftJoin(digests, eq(items.id, digests.itemId))
    .where(and(eq(items.topicId, topicId), cursor === null ? undefined : gt(items.id, cursor)))
    .orderBy(asc(items.id))
    .limit(WIKI_PAGE_ROWS);
}

export async function* topicLines(db: Database, topicId: number): AsyncGenerator<string> {
  const [topic] = await db
    .select({ name: topics.name, overview: topicPages.overview })
    .from(topics)
    .leftJoin(topicPages, eq(topics.id, topicPages.topicId))
    .where(eq(topics.id, topicId));

  if (topic === undefined) return;

  yield topicWikiHeader(topic);

  yield* linesOf(
    (cursor: { readonly at: number; readonly id: number } | null) =>
      disagreementPage(db, topicId, { cursor, limit: WIKI_PAGE_ROWS }),
    ({ items: [first, second], reason }) =>
      `- ${itemWikiLink(first)} · ${itemWikiLink(second)} · ${plainMarkdown(reason)}\n`,
    ({ at, id }) => ({ at, id }),
    `\n## ${VAULT_TEXT.disagreementsHeading}\n\n`,
  );

  yield `\n## ${VAULT_TEXT.itemsHeading}\n\n`;
  yield* linesOf(
    (cursor: number | null) => topicItems(db, topicId, cursor),
    (item) => `- ${itemWikiLink(item)}\n`,
    ({ id }) => id,
  );
}

export async function* indexLines(db: Database): AsyncGenerator<string> {
  yield `# ${VAULT_TEXT.indexHeading}\n\n`;
  yield* linesOf(
    (cursor: string | null) => topicIndexRows(db, cursor, WIKI_PAGE_ROWS),
    ({ id, name, itemCount, overview }) => {
      const line = overview === null ? null : overviewLine(overview);
      const link = wikiLink({ kind: "topic", subjectId: id }, name);
      const count = String(itemCount);

      return `- ${link} (${count})${line === null ? "" : ` · ${plainMarkdown(line)}`}\n`;
    },
    ({ key }) => key,
  );
}
