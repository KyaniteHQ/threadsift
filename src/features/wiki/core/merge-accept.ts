import { and, asc, eq, sql } from "drizzle-orm";

import { catalogKey } from "../../../core/contract/catalog-key.ts";
import {
  type Acceptance,
  MERGE_KINDS,
  type MergeKind,
} from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { pins, proposals } from "../../../core/kernel/schema.ts";
import { applyUnit } from "./merge-apply.ts";
import { recordingFailure } from "./merge-failure.ts";
import { MERGE } from "./merge-kinds.ts";
import type { MergeKindSpec, MergeRow } from "./merge-unit.ts";
import { proposalClaimed, revisionOf } from "./proposal-lifecycle.ts";

const UNITS_PER_RUN = 50;

type MergeAcceptance = Exclude<Acceptance, "not-current" | "no-provider">;

type RunAnswer = Extract<
  MergeAcceptance,
  "done" | "accepting" | "unknown" | "merge-failed" | "not-open"
>;

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

async function pinned(db: Database, { kind, from, into }: Readonly<MergeRow>): Promise<boolean> {
  const spec: MergeKindSpec = MERGE[kind];

  const [pin] = await db
    .select({ id: pins.id })
    .from(pins)
    .where(
      and(
        eq(pins.kind, kind),
        eq(pins.fromKey, catalogKey(from.name)),
        eq(spec.pin.column, into.id),
      ),
    );

  return pin !== undefined;
}

async function runUnit(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow>,
  units: number,
): Promise<RunAnswer> {
  await recordingFailure(ports.db, { id, revision: row.revision }, () => applyUnit(ports, id, row));

  return runUnits(ports, id, row, await readRow(ports.db, id, row.kind), units + 1);
}

async function runUnits(
  ports: JobPorts,
  id: number,
  last: Readonly<MergeRow>,
  row: Readonly<MergeRow> | undefined,
  units: number,
): Promise<RunAnswer> {
  if (row === undefined) return (await pinned(ports.db, last)) ? "done" : "unknown";

  if (row.state === "open") return "merge-failed";

  if (row.state !== "accepting") return "not-open";

  if (units === UNITS_PER_RUN) return "accepting";

  return runUnit(ports, id, row, units);
}

export async function acceptMerge(
  ports: JobPorts,
  id: number,
  kind: MergeKind,
): Promise<MergeAcceptance> {
  const { db } = ports;
  const before = await readRow(db, id, kind);
  const [claim] = await proposalClaimed(db, id, kind);
  const row = await readRow(db, id, kind);
  const last = row ?? before;

  if (last === undefined) return "unknown";

  if (claim !== undefined) return runUnits(ports, id, last, row, 0);

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

    const row = merge === undefined ? undefined : await readRow(ports.db, id, merge);

    if (row !== undefined) await runUnits(ports, id, row, row, 0);
  }, Promise.resolve());
}
