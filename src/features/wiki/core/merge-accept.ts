import { asc, eq, sql } from "drizzle-orm";

import {
  type Acceptance,
  MERGE_KINDS,
  type MergeKind,
} from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { heldBatch, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { proposals } from "../../../core/kernel/schema.ts";
import { applyUnit } from "./merge-apply.ts";
import { recordingFailure } from "./merge-failure.ts";
import { MERGE } from "./merge-kinds.ts";
import type { MergeKindSpec, MergeRow } from "./merge-unit.ts";
import { proposalClaimed, revisionOf } from "./proposal-lifecycle.ts";

const UNITS_PER_RUN = 50;

type MergeAcceptance = Exclude<Acceptance, "not-current" | "no-provider">;

interface Progress {
  readonly units: number;
  readonly ran: boolean;
}

const NOTHING_RUN: Progress = { units: 0, ran: false };

function sideOf(spec: Readonly<MergeKindSpec>, end: "from" | "into") {
  const { table } = spec;
  const id = spec[end];

  return {
    id: sql<number>`${id}`.as(`${end}_id`),
    key: sql<string>`(select ${table.key} from ${table} where ${table.id} = ${id})`.as(
      `${end}_key`,
    ),
    name: sql<string>`(select ${table.name} from ${table} where ${table.id} = ${id})`.as(
      `${end}_name`,
    ),
  };
}

async function readRow(db: Database, id: number, kind: MergeKind): Promise<MergeRow | undefined> {
  const spec: MergeKindSpec = MERGE[kind];

  const [row] = await db
    .select({
      state: proposals.state,
      cursor: proposals.cursor,
      revision: sql<number>`${revisionOf()}`.as("revision"),
      fromId: sideOf(spec, "from").id,
      fromKey: sideOf(spec, "from").key,
      fromName: sideOf(spec, "from").name,
      intoId: sideOf(spec, "into").id,
      intoKey: sideOf(spec, "into").key,
      intoName: sideOf(spec, "into").name,
    })
    .from(proposals)
    .innerJoin(spec.subject, eq(spec.subject.proposalId, proposals.id))
    .where(eq(proposals.id, id));

  return row === undefined
    ? undefined
    : {
        kind,
        state: row.state,
        cursor: row.cursor,
        revision: row.revision,
        from: { id: row.fromId, key: row.fromKey, name: row.fromName },
        into: { id: row.intoId, key: row.intoKey, name: row.intoName },
      };
}

async function runUnit(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow>,
  progress: Readonly<Progress>,
): Promise<"done" | "accepting" | "unknown"> {
  const outcome = await recordingFailure(ports.db, { id, revision: row.revision }, () =>
    whileOpen(() => applyUnit(ports, id, row), "held"),
  );

  if (outcome === "held") return "accepting";

  return runUnits(ports, id, await readRow(ports.db, id, row.kind), {
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

export async function acceptMerge(
  ports: JobPorts,
  id: number,
  kind: MergeKind,
): Promise<MergeAcceptance> {
  const { db } = ports;
  const claimed = await whileOpen(
    () => heldBatch(db, [proposalClaimed(db, id, kind)] as const),
    "restoring",
  );

  if (claimed === "restoring") return claimed;

  const [claim] = claimed?.[0] ?? [];
  const row = await readRow(db, id, kind);

  if (claim !== undefined) return row === undefined ? "done" : runUnit(ports, id, row, NOTHING_RUN);

  if (row === undefined) return "unknown";

  return row.state === "open" ? "merge-busy" : "not-open";
}

export async function continueMerges(ports: JobPorts): Promise<void> {
  const rows = await ports.db
    .select({ id: proposals.id, kind: proposals.kind })
    .from(proposals)
    .where(eq(proposals.state, "accepting"))
    .orderBy(asc(proposals.id));

  await rows.reduce(async (earlier, { id, kind }) => {
    await earlier;

    const merge = MERGE_KINDS.find((each) => each === kind);

    if (merge !== undefined)
      await runUnits(ports, id, await readRow(ports.db, id, merge), NOTHING_RUN);
  }, Promise.resolve());
}
