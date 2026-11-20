import { asc, sql } from "drizzle-orm";

import { searchTerms } from "../../../core/contract/search-terms.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { hasDigest } from "../../../core/kernel/digest-stored.ts";
import { searchParts } from "../../../core/kernel/schema.ts";
import { PART_GROUPS } from "../../item/core/search-part-groups.ts";

const TERMS_MAX = 12;

const CANDIDATES_MAX = 20;

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
    PART_GROUPS.digest.map((kind) => sql`${kind}`),
    sql`, `,
  );

  return sql`(with scored as materialized (select ${searchParts.itemId} as item_id, bm25(search_index) as score from search_index join ${searchParts} on ${searchParts.id} = search_index.rowid where search_index match ${query} and ${searchParts.kind} in (${kinds}) and ${searchParts.itemId} <> ${sourceId} and ${hasDigest(searchParts.itemId)}) select item_id, score from scored) as ranked`;
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
