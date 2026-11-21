import { asc, eq, sql } from "drizzle-orm";

import { type Acceptance, MERGE_KINDS } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { proposals } from "../../../core/kernel/schema.ts";
import { applyUnit } from "./merge-apply.ts";
import { recordingFailure } from "./merge-failure.ts";
import { acrossKinds } from "./merge-kinds.ts";
import type { MergeRow } from "./merge-unit.ts";
import { proposalClaimed, revisionOf } from "./proposal-lifecycle.ts";

const UNITS_PER_RUN = 50;

type MergeAcceptance = Exclude<Acceptance, "not-current" | "no-provider">;

interface Progress {
  readonly units: number;
  readonly ran: boolean;
}

const NOTHING_RUN: Progress = { units: 0, ran: false };

function nameOf(end: "from" | "into", field: "key" | "name") {
  return acrossKinds<string>(
    ({ table, from, into }) =>
      sql`(select ${table[field]} from ${table} where ${table.id} = ${end === "from" ? from : into})`,
  ).as(`${end}_${field}`);
}

function sideOf(end: "from" | "into") {
  return {
    id: acrossKinds<number>((spec) => spec[end]).as(`${end}_id`),
    key: nameOf(end, "key"),
    name: nameOf(end, "name"),
  };
}

async function readRow(db: Database, id: number): Promise<MergeRow | undefined> {
  const [row] = await db
    .select({
      kind: proposals.kind,
      state: proposals.state,
      cursor: proposals.cursor,
      revision: sql<number>`${revisionOf()}`.as("revision"),
      from: sideOf("from"),
      into: sideOf("into"),
    })
    .from(proposals)
    .where(eq(proposals.id, id));

  const kind = MERGE_KINDS.find((each) => each === row?.kind);

  return row === undefined || kind === undefined ? undefined : { ...row, kind };
}

async function runUnit(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow>,
  progress: Readonly<Progress>,
): Promise<"done" | "accepting" | "unknown"> {
  const outcome = await recordingFailure(ports.db, { id, revision: row.revision }, () =>
    applyUnit(ports, id, row),
  );

  return runUnits(ports, id, await readRow(ports.db, id), {
    units: progress.units + 1,
    ran: progress.ran || outcome === "ran",
  });
}

function runUnits(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow> | undefined,
  progress: Readonly<Progress>,
): Promise<"done" | "accepting" | "unknown"> {
  if (row?.state !== "accepting") return Promise.resolve(progress.ran ? "done" : "unknown");

  if (progress.units === UNITS_PER_RUN) return Promise.resolve("accepting");

  return runUnit(ports, id, row, progress);
}

export async function acceptMerge(ports: JobPorts, id: number): Promise<MergeAcceptance> {
  const { db } = ports;
  const [claim] = await proposalClaimed(db, id);
  const row = await readRow(db, id);

  if (claim !== undefined) return row === undefined ? "done" : runUnit(ports, id, row, NOTHING_RUN);

  if (row === undefined) return "unknown";

  return row.state === "open" ? "merge-busy" : "not-open";
}

export async function continueMerges(ports: JobPorts): Promise<void> {
  const rows = await ports.db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.state, "accepting"))
    .orderBy(asc(proposals.id));

  await rows.reduce(async (earlier, { id }) => {
    await earlier;
    await runUnits(ports, id, await readRow(ports.db, id), NOTHING_RUN);
  }, Promise.resolve());
}
