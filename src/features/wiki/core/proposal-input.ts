import { asc, count, eq, gt } from "drizzle-orm";

import { AI_INPUT_BYTES } from "../../../core/contract/ai-contract.ts";
import { utf8Length } from "../../../core/contract/encoding.ts";
import type { MergeKind } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { proposals } from "../../../core/kernel/schema.ts";
import { MERGE } from "./merge-kinds.ts";
import {
  type Candidate,
  type CandidatePair,
  candidatePairs,
  disjointPairs,
  pairKey,
} from "./proposal-candidates.ts";
import type { SentPair, SentSubject } from "./proposal-sent.ts";

const SUBJECT_PAGE = 1000;

type NamedCandidate = Candidate & { readonly name: string };

async function allPages(
  readPage: (after: number) => Promise<readonly NamedCandidate[]>,
  after = 0,
): Promise<readonly NamedCandidate[]> {
  const page = await readPage(after);
  const last = page.at(-1);

  if (last === undefined || page.length < SUBJECT_PAGE) return page;

  return [...page, ...(await allPages(readPage, last.id))];
}

function usedSubjects(db: Database, kind: MergeKind): Promise<readonly NamedCandidate[]> {
  const { table, itemLink } = MERGE[kind];

  return allPages((after) =>
    db
      .select({ id: table.id, key: table.key, name: table.name, items: count(itemLink.item) })
      .from(table)
      .innerJoin(itemLink.entry.table, eq(itemLink.entry, table.id))
      .where(gt(table.id, after))
      .groupBy(table.id)
      .orderBy(asc(table.id))
      .limit(SUBJECT_PAGE),
  );
}

async function knownPairs(db: Database, kind: MergeKind): Promise<ReadonlySet<string>> {
  const spec = MERGE[kind];

  const rows = await db
    .select({ from: spec.from, into: spec.into })
    .from(proposals)
    .where(eq(proposals.kind, kind));

  return new Set(
    rows.flatMap(({ from, into }) => (from === null || into === null ? [] : [pairKey(from, into)])),
  );
}

function proposalsJson(pairs: readonly Readonly<SentPair>[]): string {
  return JSON.stringify({ pairs: pairs.map(({ low, high }) => [low, high]) });
}

export function proposalsInput(pairs: readonly Readonly<SentPair>[]) {
  const sent: Readonly<SentPair>[] = [];

  for (const pair of pairs) {
    if (utf8Length(proposalsJson([...sent, pair])) <= AI_INPUT_BYTES) sent.push(pair);
  }

  return { input: proposalsJson(sent), sent };
}

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
  kind: MergeKind,
): Promise<readonly SentPair[]> {
  const [all, known] = await Promise.all([usedSubjects(db, kind), knownPairs(db, kind)]);
  const chosen = disjointPairs(candidatePairs(all, known));
  const ids = chosen.flatMap(({ low, high }) => [low, high]);

  if (ids.length === 0) return [];

  const { of, subject } = MERGE[kind].names;
  const names = await of(db, ids);

  const named = new Map<number, SentSubject>(
    all
      .filter(({ id }) => ids.includes(id))
      .map(({ id, name, items: used }) => [
        id,
        subject({ id, name, items: used }, names.get(id) ?? []),
      ]),
  );

  return chosen.flatMap((pair) => sentPair(pair, named) ?? []);
}
