import { asc, sql } from "drizzle-orm";

import type { SearchPartKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, searchParts } from "./schema.ts";
import { searchTerms } from "./search-terms.ts";

const TERMS_MAX = 12;

const CANDIDATES_MAX = 20;

const MATCHING_PARTS = [
  "digest-title",
  "summary",
  "tags",
] as const satisfies readonly SearchPartKind[];

export function relatedTerms({
  title,
  tags,
}: Readonly<{ title: string; tags: readonly string[] }>): readonly string[] {
  const words = [...searchTerms(title), ...tags.flatMap((tag) => searchTerms(tag))];

  return [...new Set(words)].slice(0, TERMS_MAX);
}

function scoredParts(sourceId: number, terms: readonly string[]) {
  const query = terms.map((term) => `"${term}"`).join(" OR ");

  const kinds = sql.join(
    MATCHING_PARTS.map((kind) => sql`${kind}`),
    sql`, `,
  );

  return sql`(with scored as materialized (select ${searchParts.itemId} as item_id, bm25(search_index) as score from search_index join ${searchParts} on ${searchParts.id} = search_index.rowid where search_index match ${query} and ${searchParts.kind} in (${kinds}) and ${searchParts.itemId} <> ${sourceId} and exists (select 1 from ${digests} where ${digests.itemId} = ${searchParts.itemId})) select item_id, score from scored) as ranked`;
}

export async function candidateIds(
  db: Database,
  sourceId: number,
  terms: readonly string[],
): Promise<readonly number[]> {
  if (terms.length === 0) return [];

  const rows = await db
    .select({ id: sql<number>`ranked.item_id` })
    .from(scoredParts(sourceId, terms))
    .groupBy(sql`ranked.item_id`)
    .orderBy(asc(sql`min(ranked.score)`), asc(sql`ranked.item_id`))
    .limit(CANDIDATES_MAX);

  return rows.map(({ id }) => id);
}
