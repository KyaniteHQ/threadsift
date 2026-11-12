import { type SQL, eq, sql } from "drizzle-orm";

import { AI_DEADLINE_MS } from "./ai-contract.ts";
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
import { proposalsInput, readProposalPairs } from "./proposal-input.ts";
import {
  PROPOSALS_OUTPUT_TOKENS,
  type ProposalsResult,
  type SentPair,
  proposalsTask,
} from "./proposal-task.ts";
import { catalogVersion, proposals, tags, topics } from "./schema.ts";

interface StoredRow {
  readonly from: number;
  readonly into: number;
  readonly reason: string | null;
  readonly state: "open" | "declined";
}

type ProposalKind = Parameters<typeof proposalsTask>[0];

const RUNS: Readonly<Record<ProposalKind, { readonly label: string; readonly event: string }>> = {
  "tag-merge": { label: "Proposals run", event: "proposals-run-failed" },
  "topic-merge": { label: "Topic proposals run", event: "topic-proposals-run-failed" },
};

function sentExist(kind: ProposalKind, sent: readonly Readonly<SentPair>[]): SQL {
  const ids = JSON.stringify(sent.flatMap(({ low, high }) => [low.id, high.id]));
  const table = kind === "tag-merge" ? tags : topics;

  return sql`not exists (select 1 from json_each(${ids}) as wanted where not exists (select 1 from ${table} where ${table.id} = wanted.value))`;
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

function storedRows(
  db: Database,
  kind: ProposalKind,
  rows: readonly Readonly<StoredRow>[],
): JobWrites {
  if (rows.length === 0) return [];

  const side = (own: ProposalKind, path: "from" | "into") =>
    kind === own ? sql<number>`json_extract(stored.value, ${`$.${path}`})` : sql<null>`null`;

  return [
    db
      .insert(proposals)
      .select(
        db
          .select({
            id: sql<null>`null`.as("id"),
            kind: sql<ProposalKind>`${kind}`.as("kind"),
            fromTagId: side("tag-merge", "from").as("from_tag_id"),
            intoTagId: side("tag-merge", "into").as("into_tag_id"),
            fromTopicId: side("topic-merge", "from").as("from_topic_id"),
            intoTopicId: side("topic-merge", "into").as("into_topic_id"),
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
  kind: ProposalKind,
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
  return guardedOutcome(db, sql`${sentExist(kind, sent)} and ${aiTaskRunning(taskId)}`, {
    taskId,
    writes: [
      ...storedRows(db, kind, rowsOf(sent, result.merges)),
      completedAiTask(db, { taskId, result }),
    ],
  });
}

async function catalogRevision(ports: JobPorts): Promise<number> {
  const [row] = await ports.db
    .select({ version: catalogVersion.version })
    .from(catalogVersion)
    .where(eq(catalogVersion.id, 1));

  return row?.version ?? 0;
}

async function attemptRun(
  kind: ProposalKind,
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
): Promise<JobOutcome> {
  const { db } = ports;
  const inputRevision = await catalogRevision(ports);
  const { input, sent } = proposalsInput(await readProposalPairs(db, kind));

  if (sent.length === 0) return guardedOutcome(db, sql`1`);

  const result = await runAiTask(
    ports,
    proposalsTask(kind, sent),
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
    const refused = await refusalOutcome(db, job, {
      result,
      current: sentExist(kind, sent),
      label: RUNS[kind].label,
    });

    console.warn(JSON.stringify({ event: RUNS[kind].event, reason: result.reason }));

    return refused;
  }

  return storedOutcome(db, kind, { sent, taskId: result.taskId, result: result.result });
}

function handlerOf(kind: ProposalKind): JobHandler {
  return {
    deadlineMs: AI_DEADLINE_MS,
    blockedBy: [],
    attempt: (ports, job) => attemptRun(kind, ports, job),
    exhausted: () => [],
  };
}

export const proposalsHandler = handlerOf("tag-merge");

export const topicProposalsHandler = handlerOf("topic-merge");
