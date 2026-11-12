import { type SQL, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { guardedResults } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import { MERGES } from "./merge-kinds.ts";
import { readRow } from "./merge-row.ts";
import type { MergeRow, MergeUnit } from "./merge-unit.ts";
import type { Database } from "./ports.ts";
import { proposals } from "./schema.ts";

export const UNITS_PER_ACCEPT = 50;

export type Acceptance =
  | "done"
  | "accepting"
  | "unknown"
  | "not-open"
  | "merge-busy"
  | "topic-busy";

const OpenedSchema = z.array(z.object({ id: z.number().int() }));

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

async function free(db: Database, release: MergeUnit["release"]): Promise<void> {
  const [first, ...rest] = release;

  if (first !== undefined) await db.batch([first, ...rest]);
}

type Outcome = "ran" | "lost" | "busy";

async function runUnit(ports: JobPorts, id: number, row: Readonly<MergeRow>): Promise<Outcome> {
  const { db } = ports;
  const unit = await MERGES[row.kind].plan(db, id, row);

  if (unit === "busy") return "busy";

  const writes = [
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
    ...unit.release,
    ...unit.closing,
  ];

  try {
    const results = await guardedResults(db, sql`${unitGuard(id, row)} and ${unit.guard}`, writes);

    if (results === null) {
      await free(db, unit.release);

      return "lost";
    }

    if (unit.opening !== null) {
      await enqueueRows(ports, OpenedSchema.parse(results[writes.indexOf(unit.opening)]));
    }

    return "ran";
  } catch (error) {
    await free(db, unit.release);

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

export async function acceptProposal(ports: JobPorts, id: number): Promise<Acceptance> {
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

  if (outcome === "lost") return acceptProposal(ports, id);

  return (await readRow(db, id)) === undefined
    ? "done"
    : continueMerge(ports, id, UNITS_PER_ACCEPT - 1);
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
