import { type SQL, eq, sql } from "drizzle-orm";

import { AI_DEADLINE_MS, type AiRefused } from "./ai-contract.ts";
import { aiTaskRunning, completedAiTask, runAiTask } from "./ai-tasks.ts";
import { guardedOutcome, lostOutcome, refusalOutcome } from "./guarded-outcome.ts";
import type {
  ClaimedJob,
  JobHandler,
  JobOutcome,
  JobPorts,
  JobWrites,
  SettledOutcome,
} from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { pairKey } from "./proposal-candidates.ts";
import { proposalsInput, readProposals } from "./proposal-input.ts";
import {
  PROPOSALS_OUTPUT_TOKENS,
  type ProposalsResult,
  type SentPair,
  proposalsTask,
} from "./proposal-task.ts";
import { catalogVersion, proposals, tags } from "./schema.ts";

interface StoredRow {
  readonly from: number;
  readonly into: number;
  readonly reason: string | null;
  readonly state: "open" | "declined";
}

function sentTagsExist(sent: readonly Readonly<SentPair>[]): SQL {
  const ids = JSON.stringify(sent.flatMap(({ low, high }) => [low.id, high.id]));

  return sql`not exists (select 1 from json_each(${ids}) as wanted where not exists (select 1 from ${tags} where ${tags.id} = wanted.value))`;
}

function rowsOf(
  sent: readonly Readonly<SentPair>[],
  merges: ProposalsResult["merges"],
): readonly StoredRow[] {
  const merged = new Set(merges.map(({ from, into }) => pairKey(from, into)));

  return [
    ...merges.map(({ from, into, reason }) => ({ from, into, reason, state: "open" as const })),
    ...sent.flatMap(({ low, high }) =>
      merged.has(pairKey(low.id, high.id))
        ? []
        : [{ from: low.id, into: high.id, reason: null, state: "declined" as const }],
    ),
  ];
}

function storedRows(db: Database, rows: readonly Readonly<StoredRow>[]): JobWrites {
  if (rows.length === 0) return [];

  return [
    db
      .insert(proposals)
      .select(
        db
          .select({
            id: sql<null>`null`.as("id"),
            kind: sql<"tag-merge">`'tag-merge'`.as("kind"),
            fromTagId: sql<number>`json_extract(stored.value, '$.from')`.as("from_tag_id"),
            intoTagId: sql<number>`json_extract(stored.value, '$.into')`.as("into_tag_id"),
            reason: sql<string | null>`json_extract(stored.value, '$.reason')`.as("reason"),
            state: sql<StoredRow["state"]>`json_extract(stored.value, '$.state')`.as("state"),
            createdAt: sql<number>`${Date.now()}`.as("created_at"),
            cursor: sql<null>`null`.as("cursor"),
            moved: sql<null>`null`.as("moved"),
            unitRevision: sql<null>`null`.as("unit_revision"),
          })
          .from(sql`json_each(${JSON.stringify(rows)}) as stored`)
          .where(sql`true`),
      )
      .onConflictDoNothing(),
  ];
}

function storedOutcome(
  db: Database,
  {
    sent,
    taskId,
    result,
  }: Readonly<{
    sent: readonly Readonly<SentPair>[];
    taskId: number;
    result: Readonly<ProposalsResult>;
  }>,
): SettledOutcome {
  return guardedOutcome(db, sql`${sentTagsExist(sent)} and ${aiTaskRunning(taskId)}`, {
    taskId,
    writes: [
      ...storedRows(db, rowsOf(sent, result.merges)),
      completedAiTask(db, { taskId, result }),
    ],
  });
}

function refusedOutcome(
  db: Database,
  job: Readonly<ClaimedJob>,
  {
    result,
    sent,
  }: Readonly<{
    result: Readonly<AiRefused & { readonly taskId: number | null }>;
    sent: readonly Readonly<SentPair>[];
  }>,
): Promise<SettledOutcome> {
  return refusalOutcome(db, job, { result, current: sentTagsExist(sent), label: "Proposals run" });
}

async function catalogRevision(ports: JobPorts): Promise<number> {
  const [row] = await ports.db
    .select({ version: catalogVersion.version })
    .from(catalogVersion)
    .where(eq(catalogVersion.id, 1));

  return row?.version ?? 0;
}

async function attemptProposals(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const { db } = ports;
  const inputRevision = await catalogRevision(ports);
  const { input, sent } = proposalsInput(await readProposals(db));

  if (sent.length === 0) return guardedOutcome(db, sql`1`);

  const result = await runAiTask(
    ports,
    proposalsTask(sent),
    {
      text: input,
      inputRevision,
      attempts: job.attempts + 1,
      maxOutputTokens: PROPOSALS_OUTPUT_TOKENS,
    },
    job,
  );

  if (result.kind === "claim-lost") return lostOutcome(db);

  if (result.kind !== "done") {
    const refused = await refusedOutcome(db, job, { result, sent });

    console.warn(JSON.stringify({ event: "proposals-run-failed", reason: result.reason }));

    return refused;
  }

  return storedOutcome(db, { sent, taskId: result.taskId, result: result.result });
}

export const proposalsHandler: JobHandler = {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptProposals,
  exhausted: () => [],
};
