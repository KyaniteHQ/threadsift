import { type SQL, eq, sql } from "drizzle-orm";

import { AI_DEADLINE_MS, type AiRefused, type AiTaskDefinition } from "./ai-contract.ts";
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
import { proposalsInput, readProposals, readTopicProposals } from "./proposal-input.ts";
import {
  PROPOSALS_OUTPUT_TOKENS,
  type ProposalsResult,
  type SentPair,
  proposalsTask,
  topicProposalsTask,
} from "./proposal-task.ts";
import { catalogVersion, proposals, tags, topics } from "./schema.ts";

interface StoredRow {
  readonly from: number;
  readonly into: number;
  readonly reason: string | null;
  readonly state: "open" | "declined";
}

interface WeeklyRun {
  readonly subject: "tag" | "topic";
  readonly kind: "tag-merge" | "topic-merge";
  readonly label: string;
  readonly event: string;
  readonly read: (db: Database) => Promise<readonly Readonly<SentPair>[]>;
  readonly task: (sent: readonly Readonly<SentPair>[]) => AiTaskDefinition<ProposalsResult>;
}

const TAG_RUN: WeeklyRun = {
  subject: "tag",
  kind: "tag-merge",
  label: "Proposals run",
  event: "proposals-run-failed",
  read: readProposals,
  task: proposalsTask,
};

const TOPIC_RUN: WeeklyRun = {
  subject: "topic",
  kind: "topic-merge",
  label: "Topic proposals run",
  event: "topic-proposals-run-failed",
  read: readTopicProposals,
  task: topicProposalsTask,
};

function sentExist({ subject }: Readonly<WeeklyRun>, sent: readonly Readonly<SentPair>[]): SQL {
  const ids = JSON.stringify(sent.flatMap(({ low, high }) => [low.id, high.id]));
  const table = subject === "tag" ? tags : topics;

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
  { subject, kind }: Readonly<WeeklyRun>,
  rows: readonly Readonly<StoredRow>[],
): JobWrites {
  if (rows.length === 0) return [];

  const side = (own: typeof subject, path: "from" | "into") =>
    subject === own ? sql<number>`json_extract(stored.value, ${`$.${path}`})` : sql<null>`null`;

  return [
    db
      .insert(proposals)
      .select(
        db
          .select({
            id: sql<null>`null`.as("id"),
            kind: sql<WeeklyRun["kind"]>`${kind}`.as("kind"),
            fromTagId: side("tag", "from").as("from_tag_id"),
            intoTagId: side("tag", "into").as("into_tag_id"),
            fromTopicId: side("topic", "from").as("from_topic_id"),
            intoTopicId: side("topic", "into").as("into_topic_id"),
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
  run: Readonly<WeeklyRun>,
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
  return guardedOutcome(db, sql`${sentExist(run, sent)} and ${aiTaskRunning(taskId)}`, {
    taskId,
    writes: [
      ...storedRows(db, run, rowsOf(sent, result.merges)),
      completedAiTask(db, { taskId, result }),
    ],
  });
}

function refusedOutcome(
  db: Database,
  run: Readonly<WeeklyRun>,
  job: Readonly<ClaimedJob>,
  {
    result,
    sent,
  }: Readonly<{
    result: Readonly<AiRefused & { readonly taskId: number | null }>;
    sent: readonly Readonly<SentPair>[];
  }>,
): Promise<SettledOutcome> {
  return refusalOutcome(db, job, { result, current: sentExist(run, sent), label: run.label });
}

async function catalogRevision(ports: JobPorts): Promise<number> {
  const [row] = await ports.db
    .select({ version: catalogVersion.version })
    .from(catalogVersion)
    .where(eq(catalogVersion.id, 1));

  return row?.version ?? 0;
}

async function attemptRun(
  run: Readonly<WeeklyRun>,
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
): Promise<JobOutcome> {
  const { db } = ports;
  const inputRevision = await catalogRevision(ports);
  const { input, sent } = proposalsInput(await run.read(db));

  if (sent.length === 0) return guardedOutcome(db, sql`1`);

  const result = await runAiTask(
    ports,
    run.task(sent),
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
    const refused = await refusedOutcome(db, run, job, { result, sent });

    console.warn(JSON.stringify({ event: run.event, reason: result.reason }));

    return refused;
  }

  return storedOutcome(db, run, { sent, taskId: result.taskId, result: result.result });
}

function handlerOf(run: Readonly<WeeklyRun>): JobHandler {
  return {
    deadlineMs: AI_DEADLINE_MS,
    blockedBy: [],
    attempt: (ports, job) => attemptRun(run, ports, job),
    exhausted: () => [],
  };
}

export const proposalsHandler = handlerOf(TAG_RUN);

export const topicProposalsHandler = handlerOf(TOPIC_RUN);
