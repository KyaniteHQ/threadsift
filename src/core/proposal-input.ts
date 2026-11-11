import { asc, count, eq, gt, inArray } from "drizzle-orm";

import { utf8Length } from "./digest-prompt.ts";
import type { Database } from "./ports.ts";
import {
  type CandidatePair,
  type CandidateTag,
  candidatePairs,
  disjointPairs,
  pairKey,
} from "./proposal-candidates.ts";
import { PROPOSALS_INPUT_BYTES, type ProposalTag, type SentPair } from "./proposal-task.ts";
import { itemTags, items, proposals, tags, topics } from "./schema.ts";

const TOPICS_PER_TAG = 3;

const TAG_PAGE = 1000;

type NamedTag = CandidateTag & { readonly name: string };

async function usedTags(db: Database, after = 0): Promise<readonly NamedTag[]> {
  const page = await db
    .select({ id: tags.id, key: tags.key, name: tags.name, items: count(itemTags.itemId) })
    .from(tags)
    .innerJoin(itemTags, eq(itemTags.tagId, tags.id))
    .where(gt(tags.id, after))
    .groupBy(tags.id)
    .orderBy(asc(tags.id))
    .limit(TAG_PAGE);

  const last = page.at(-1);

  if (last === undefined || page.length < TAG_PAGE) return page;

  return [...page, ...(await usedTags(db, last.id))];
}

async function knownPairs(db: Database): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ from: proposals.fromTagId, into: proposals.intoTagId })
    .from(proposals);

  return new Set(rows.map(({ from, into }) => pairKey(from, into)));
}

async function topicsOf(
  db: Database,
  ids: readonly number[],
): Promise<ReadonlyMap<number, readonly string[]>> {
  const rows = await db
    .select({
      tagId: itemTags.tagId,
      key: topics.key,
      name: topics.name,
      used: count(),
    })
    .from(itemTags)
    .innerJoin(items, eq(items.id, itemTags.itemId))
    .innerJoin(topics, eq(topics.id, items.topicId))
    .where(inArray(itemTags.tagId, ids))
    .groupBy(itemTags.tagId, topics.id);

  const byTag = new Map<number, typeof rows>();

  for (const row of rows) byTag.set(row.tagId, [...(byTag.get(row.tagId) ?? []), row]);

  return new Map(
    [...byTag].map(([tagId, each]) => [
      tagId,
      each
        .toSorted((first, second) => second.used - first.used || (first.key < second.key ? -1 : 1))
        .slice(0, TOPICS_PER_TAG)
        .map(({ name }) => name),
    ]),
  );
}

function proposalsJson(pairs: readonly Readonly<SentPair>[]): string {
  return JSON.stringify({ pairs: pairs.map(({ low, high }) => [low, high]) });
}

export function proposalsInput(pairs: readonly Readonly<SentPair>[]) {
  const sent: SentPair[] = [];

  for (const pair of pairs) {
    if (utf8Length(proposalsJson([...sent, pair])) <= PROPOSALS_INPUT_BYTES) sent.push(pair);
  }

  return { input: proposalsJson(sent), sent };
}

function sentPair(
  { low, high }: Readonly<CandidatePair>,
  named: Readonly<ReadonlyMap<number, Readonly<ProposalTag>>>,
): SentPair | null {
  const first = named.get(low);
  const second = named.get(high);

  return first === undefined || second === undefined ? null : { low: first, high: second };
}

export async function readProposals(db: Database) {
  const [all, known] = await Promise.all([usedTags(db), knownPairs(db)]);
  const chosen = disjointPairs(candidatePairs(all, known));
  const ids = chosen.flatMap(({ low, high }) => [low, high]);

  if (ids.length === 0) return [];

  const topicNames = await topicsOf(db, ids);

  const named = new Map(
    all
      .filter(({ id }) => ids.includes(id))
      .map(({ id, name, items: used }) => [
        id,
        { id, name, items: used, topics: topicNames.get(id) ?? [] },
      ]),
  );

  return chosen.flatMap((pair) => sentPair(pair, named) ?? []);
}
