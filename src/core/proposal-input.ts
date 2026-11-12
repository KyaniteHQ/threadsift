import { asc, count, eq, gt, inArray, sql } from "drizzle-orm";

import { utf8Length } from "./digest-prompt.ts";
import type { ProposalKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import {
  type Candidate,
  type CandidatePair,
  candidatePairs,
  disjointPairs,
  pairKey,
} from "./proposal-candidates.ts";
import { PROPOSALS_INPUT_BYTES, type SentPair, type SentSubject } from "./proposal-task.ts";
import { itemTags, items, proposals, tags, topics } from "./schema.ts";

const NAMES_PER_SUBJECT = 3;

const SUBJECT_PAGE = 1000;

type NamedCandidate = Candidate & { readonly name: string };

interface NameRow {
  readonly owner: number;
  readonly key: string;
  readonly name: string;
  readonly used: number;
}

async function allPages(
  readPage: (after: number) => Promise<readonly NamedCandidate[]>,
  after = 0,
): Promise<readonly NamedCandidate[]> {
  const page = await readPage(after);
  const last = page.at(-1);

  if (last === undefined || page.length < SUBJECT_PAGE) return page;

  return [...page, ...(await allPages(readPage, last.id))];
}

const USED = {
  "tag-merge": { table: tags, linked: itemTags, link: itemTags.tagId, counted: itemTags.itemId },
  "topic-merge": { table: topics, linked: items, link: items.topicId, counted: items.id },
} as const;

function usedSubjects(db: Database, kind: ProposalKind): Promise<readonly NamedCandidate[]> {
  const { table, linked, link, counted } = USED[kind];

  return allPages((after) =>
    db
      .select({ id: table.id, key: table.key, name: table.name, items: count(counted) })
      .from(table)
      .innerJoin(linked, eq(link, table.id))
      .where(gt(table.id, after))
      .groupBy(table.id)
      .orderBy(asc(table.id))
      .limit(SUBJECT_PAGE),
  );
}

async function knownPairs(db: Database, kind: ProposalKind): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({
      from: sql<number>`coalesce(${proposals.fromTagId}, ${proposals.fromTopicId})`,
      into: sql<number>`coalesce(${proposals.intoTagId}, ${proposals.intoTopicId})`,
    })
    .from(proposals)
    .where(eq(proposals.kind, kind));

  return new Set(rows.map(({ from, into }) => pairKey(from, into)));
}

function mostUsed(rows: readonly Readonly<NameRow>[]): ReadonlyMap<number, readonly string[]> {
  const byOwner = new Map<number, NameRow[]>();

  for (const row of rows) byOwner.set(row.owner, [...(byOwner.get(row.owner) ?? []), row]);

  return new Map(
    [...byOwner].map(([owner, each]) => [
      owner,
      each
        .toSorted((first, second) => second.used - first.used || (first.key < second.key ? -1 : 1))
        .slice(0, NAMES_PER_SUBJECT)
        .map(({ name }) => name),
    ]),
  );
}

async function topicsOf(db: Database, ids: readonly number[]) {
  return mostUsed(
    await db
      .select({ owner: itemTags.tagId, key: topics.key, name: topics.name, used: count() })
      .from(itemTags)
      .innerJoin(items, eq(items.id, itemTags.itemId))
      .innerJoin(topics, eq(topics.id, items.topicId))
      .where(inArray(itemTags.tagId, ids))
      .groupBy(itemTags.tagId, topics.id),
  );
}

async function tagsOf(db: Database, ids: readonly number[]) {
  return mostUsed(
    await db
      .select({
        owner: sql<number>`${items.topicId}`,
        key: tags.key,
        name: tags.name,
        used: count(),
      })
      .from(items)
      .innerJoin(itemTags, eq(itemTags.itemId, items.id))
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(inArray(items.topicId, ids))
      .groupBy(items.topicId, tags.id),
  );
}

function proposalsJson(pairs: readonly Readonly<SentPair>[]): string {
  return JSON.stringify({ pairs: pairs.map(({ low, high }) => [low, high]) });
}

export function proposalsInput(pairs: readonly Readonly<SentPair>[]) {
  const sent: Readonly<SentPair>[] = [];

  for (const pair of pairs) {
    if (utf8Length(proposalsJson([...sent, pair])) <= PROPOSALS_INPUT_BYTES) sent.push(pair);
  }

  return { input: proposalsJson(sent), sent };
}

const NAMES = {
  "tag-merge": { of: topicsOf, field: "topics" },
  "topic-merge": { of: tagsOf, field: "tags" },
} as const;

function sentPair(
  { low, high }: Readonly<CandidatePair>,
  named: Readonly<ReadonlyMap<number, SentSubject>>,
): SentPair | null {
  const first = named.get(low);
  const second = named.get(high);

  return first === undefined || second === undefined ? null : { low: first, high: second };
}

export async function readProposalPairs(
  db: Database,
  kind: ProposalKind,
): Promise<readonly SentPair[]> {
  const [all, known] = await Promise.all([usedSubjects(db, kind), knownPairs(db, kind)]);
  const chosen = disjointPairs(candidatePairs(all, known));
  const ids = chosen.flatMap(({ low, high }) => [low, high]);

  if (ids.length === 0) return [];

  const { of, field } = NAMES[kind];
  const names = await of(db, ids);

  const named = new Map<number, SentSubject>(
    all
      .filter(({ id }) => ids.includes(id))
      .map(({ id, name, items: used }) => [
        id,
        { id, name, items: used, [field]: names.get(id) ?? [] },
      ]),
  );

  return chosen.flatMap((pair) => sentPair(pair, named) ?? []);
}
