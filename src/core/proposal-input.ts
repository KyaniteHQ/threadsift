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
import {
  PROPOSALS_INPUT_BYTES,
  type ProposalTag,
  type ProposalTopic,
  type SentPair,
  type SentSubject,
} from "./proposal-task.ts";
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

function usedTags(db: Database): Promise<readonly NamedCandidate[]> {
  return allPages((after) =>
    db
      .select({ id: tags.id, key: tags.key, name: tags.name, items: count(itemTags.itemId) })
      .from(tags)
      .innerJoin(itemTags, eq(itemTags.tagId, tags.id))
      .where(gt(tags.id, after))
      .groupBy(tags.id)
      .orderBy(asc(tags.id))
      .limit(SUBJECT_PAGE),
  );
}

function usedTopics(db: Database): Promise<readonly NamedCandidate[]> {
  return allPages((after) =>
    db
      .select({ id: topics.id, key: topics.key, name: topics.name, items: count(items.id) })
      .from(topics)
      .innerJoin(items, eq(items.topicId, topics.id))
      .where(gt(topics.id, after))
      .groupBy(topics.id)
      .orderBy(asc(topics.id))
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

export function proposalsInput<Pair extends Readonly<SentPair>>(pairs: readonly Pair[]) {
  const sent: Pair[] = [];

  for (const pair of pairs) {
    if (utf8Length(proposalsJson([...sent, pair])) <= PROPOSALS_INPUT_BYTES) sent.push(pair);
  }

  return { input: proposalsJson(sent), sent };
}

interface PairSource<Subject extends SentSubject> {
  readonly used: (db: Database) => Promise<readonly NamedCandidate[]>;
  readonly known: (db: Database) => Promise<ReadonlySet<string>>;
  readonly names: (
    db: Database,
    ids: readonly number[],
  ) => Promise<ReadonlyMap<number, readonly string[]>>;
  readonly subject: (row: Readonly<NamedCandidate>, names: readonly string[]) => Subject;
}

function sentPair<Subject extends SentSubject>(
  { low, high }: Readonly<CandidatePair>,
  named: Readonly<ReadonlyMap<number, Subject>>,
): SentPair<Subject> | null {
  const first = named.get(low);
  const second = named.get(high);

  return first === undefined || second === undefined ? null : { low: first, high: second };
}

async function readPairs<Subject extends SentSubject>(
  db: Database,
  source: Readonly<PairSource<Subject>>,
): Promise<readonly SentPair<Subject>[]> {
  const [all, known] = await Promise.all([source.used(db), source.known(db)]);
  const chosen = disjointPairs(candidatePairs(all, known));
  const ids = chosen.flatMap(({ low, high }) => [low, high]);

  if (ids.length === 0) return [];

  const names = await source.names(db, ids);

  const named = new Map<number, Subject>(
    all
      .filter(({ id }) => ids.includes(id))
      .map((row) => [row.id, source.subject(row, names.get(row.id) ?? [])] as const),
  );

  return chosen.flatMap((pair) => sentPair(pair, named) ?? []);
}

export function readProposals(db: Database): Promise<readonly SentPair<ProposalTag>[]> {
  return readPairs(db, {
    used: usedTags,
    known: (each) => knownPairs(each, "tag-merge"),
    names: topicsOf,
    subject: ({ id, name, items: used }, names) => ({ id, name, items: used, topics: names }),
  });
}

export function readTopicProposals(db: Database): Promise<readonly SentPair<ProposalTopic>[]> {
  return readPairs(db, {
    used: usedTopics,
    known: (each) => knownPairs(each, "topic-merge"),
    names: tagsOf,
    subject: ({ id, name, items: used }, names) => ({ id, name, items: used, tags: names }),
  });
}
