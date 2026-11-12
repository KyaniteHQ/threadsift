import { type SQL, and, asc, eq, sql } from "drizzle-orm";

import { guardedResults } from "./guards.ts";
import { acceptLostHighlight } from "./highlight-proposals.ts";
import type { JobPorts } from "./job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "./job-rows.ts";
import { MERGES, readRow } from "./merge-kinds.ts";
import type { MergeRow } from "./merge-unit.ts";
import { acceptOverviewGap } from "./overview-accept.ts";
import { knownProposal, proposals } from "./schema.ts";
import { leaseHolds, releaseTopicLease, releaseTopicLeases } from "./topic-lease.ts";

const UNITS_PER_ACCEPT = 50;

export type Acceptance =
  | "done"
  | "accepting"
  | "unknown"
  | "not-open"
  | "not-current"
  | "not-supported"
  | "no-provider"
  | "merge-busy"
  | "topic-busy";

function acceptingElsewhere(): SQL {
  return sql`exists (select 1 from ${proposals} where ${proposals.state} = 'accepting')`;
}

function unitGuard(id: number, row: Readonly<MergeRow>): SQL {
  const { catalog } = MERGES[row.kind];
  const names = sql`${proposals.id} = ${id} and ${catalog.proposalFrom} = ${row.from.id} and ${catalog.proposalInto} = ${row.into.id} and exists (select 1 from ${catalog.table} where ${catalog.table.id} = ${row.from.id} and ${catalog.table.key} = ${row.from.key}) and exists (select 1 from ${catalog.table} where ${catalog.table.id} = ${row.into.id} and ${catalog.table.key} = ${row.into.key})`;

  return row.state === "open"
    ? sql`exists (select 1 from ${proposals} where ${names} and ${proposals.state} = 'open') and not ${acceptingElsewhere()}`
    : sql`exists (select 1 from ${proposals} where ${names} and ${proposals.state} = 'accepting' and coalesce(${proposals.unitRevision}, 0) = ${row.revision})`;
}

type Outcome = "ran" | "lost" | "busy";

async function runUnit(ports: JobPorts, id: number, row: Readonly<MergeRow>): Promise<Outcome> {
  const { db } = ports;
  const unit = await MERGES[row.kind].plan(db, id, row);

  if (unit === "busy" || unit === "lost") return unit;

  const head = [
    db
      .update(proposals)
      .set({ state: "accepting", moved: sql`coalesce(${proposals.moved}, 0) + ${unit.moving}` })
      .where(eq(proposals.id, id)),
    ...unit.pin,
    ...unit.moves,
    db
      .update(proposals)
      .set({ cursor: unit.cursor, unitRevision: row.revision + 1 })
      .where(eq(proposals.id, id)),
    ...unit.leases.map((lease) => releaseTopicLease(db, lease)),
  ];

  const writes = [...head, ...unit.closing.writes];

  try {
    const holds = sql`${and(unitGuard(id, row), ...unit.leases.map((lease) => leaseHolds(lease)))}`;
    const results = await guardedResults(db, holds, writes);

    if (results === null) {
      await releaseTopicLeases(db, unit.leases);

      return "lost";
    }

    await enqueueRows(
      ports,
      unit.closing.wakes.flatMap((at) => OpenedJobsSchema.parse(results[head.length + at])),
    );

    return "ran";
  } catch (error) {
    await releaseTopicLeases(db, unit.leases);

    throw error;
  }
}

export async function continueMerge(
  ports: JobPorts,
  id: number,
  budget: number,
): Promise<"done" | "accepting"> {
  const row = await readRow(ports.db, id);

  if (row?.state !== "accepting") return "done";

  if (budget === 0) return "accepting";

  if ((await runUnit(ports, id, row)) === "busy") return "accepting";

  return continueMerge(ports, id, budget - 1);
}

async function acceptMerge(ports: JobPorts, id: number): Promise<Acceptance> {
  const { db } = ports;
  const row = await readRow(db, id);

  if (row === undefined) return "unknown";

  if (row.state !== "open") return "not-open";

  const [elsewhere] = await db
    .select({ busy: sql<number>`${acceptingElsewhere()}` })
    .from(sql`(select 1)`);

  if (elsewhere?.busy === 1) return "merge-busy";

  const outcome = await runUnit(ports, id, row);

  if (outcome === "busy") return "topic-busy";

  if (outcome === "lost") return acceptMerge(ports, id);

  return (await readRow(db, id)) === undefined
    ? "done"
    : continueMerge(ports, id, UNITS_PER_ACCEPT - 1);
}

type Accepting = (ports: JobPorts, id: number) => Promise<Acceptance>;

const ACCEPT = {
  "tag-merge": acceptMerge,
  "topic-merge": acceptMerge,
  "highlight-lost": ({ db }, id) => acceptLostHighlight(db, id),
  "overview-gap": acceptOverviewGap,
  "items-disagree": () => Promise.resolve("not-supported"),
} as const satisfies Readonly<Record<(typeof proposals.$inferSelect)["kind"], Accepting>>;

export async function acceptProposal(ports: JobPorts, id: number): Promise<Acceptance> {
  const [found] = await ports.db
    .select({ kind: proposals.kind })
    .from(proposals)
    .where(and(eq(proposals.id, id), knownProposal));

  return found === undefined ? "unknown" : ACCEPT[found.kind](ports, id);
}

export async function continueMerges(ports: JobPorts): Promise<void> {
  const rows = await ports.db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.state, "accepting"))
    .orderBy(asc(proposals.id));

  await rows.reduce(async (earlier, { id }) => {
    await earlier;
    await continueMerge(ports, id, UNITS_PER_ACCEPT);
  }, Promise.resolve());
}
