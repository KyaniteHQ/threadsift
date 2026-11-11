import { and, eq, lt, sql } from "drizzle-orm";

import {
  type AiConnection,
  type Provider,
  type AiRefused,
  type AiRefusal,
  type AiTaskDefinition,
  AI_DEADLINE_MS,
  BASE_OUTPUT_TOKENS,
  VERIFY_INPUT,
  ModelDigestSchema,
  modelOf,
  refusedAi,
} from "./ai-contract.ts";
import { loadAiConfig } from "./ai-settings.ts";
import { DIGEST_INSTRUCTIONS, cutDigestInput } from "./digest-prompt.ts";
import { holding } from "./job-rows.ts";
import type { AiPorts, Database } from "./ports.ts";
import { type JobRow, aiTasks, settings } from "./schema.ts";

export const TASKS = {
  digest: {
    kind: "digest",
    instructions: DIGEST_INSTRUCTIONS,
    schema: ModelDigestSchema,
    prepareInput: cutDigestInput,
  },
} as const;

export interface DoneTask<Result> {
  readonly kind: "done";
  readonly result: Result;
  readonly taskId: number;
  readonly provider: Provider;
  readonly model: string | null;
}

type TaskResult<Result> = DoneTask<Result> | (AiRefused & { readonly taskId: number | null });

export type TaskOwner = Readonly<Pick<JobRow, "id" | "attempts" | "itemId">>;

export interface ClaimLost {
  readonly kind: "claim-lost";
}

const CLAIM_LOST: ClaimLost = { kind: "claim-lost" };

export function completedAiTask<Result>(
  db: Database,
  task: Readonly<Pick<DoneTask<Result>, "taskId" | "result">>,
) {
  return db
    .update(aiTasks)
    .set({ state: "done", result: JSON.stringify(task.result), refusal: null, status: null })
    .where(and(eq(aiTasks.id, task.taskId), eq(aiTasks.state, "running")));
}

export function providerSet() {
  return sql`exists (select 1 from ${settings} where ${settings.id} = 1)`;
}

export function aiTaskRunning(taskId: number) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${taskId} and ${aiTasks.state} = 'running')`;
}

export function failedAiTask(
  db: Database,
  taskId: number,
  failure: Readonly<{ reason: AiRefusal | "stale" | "lease-lost"; status: number | null }>,
) {
  return failingAiTask(db, failure).where(
    and(eq(aiTasks.id, taskId), eq(aiTasks.state, "running")),
  );
}

function failingAiTask(
  db: Database,
  failure: Readonly<{ reason: AiRefusal | "stale" | "lease-lost"; status: number | null }>,
) {
  return db
    .update(aiTasks)
    .set({ state: "failed", result: null, refusal: failure.reason, status: failure.status });
}

export function expireAiTasks(db: Database, now: number) {
  return failingAiTask(db, { reason: "timeout", status: null }).where(
    and(eq(aiTasks.state, "running"), lt(aiTasks.deadline, now)),
  );
}

export async function verifyAi(ports: AiPorts, attempt: AbortSignal) {
  const result = await runAiTask(
    ports,
    TASKS.digest,
    { text: VERIFY_INPUT, inputRevision: 1, attempts: 1, maxOutputTokens: BASE_OUTPUT_TOKENS },
    null,
    attempt,
  );

  if (result.kind !== "done")
    return { kind: result.kind, reason: result.reason, status: result.status };

  const digest = { ...result.result, keptComments: [] };

  try {
    await completedAiTask(ports.db, { taskId: result.taskId, result: digest });
  } catch {
    return failTask(ports, result.taskId);
  }

  return { kind: result.kind, digest, taskId: result.taskId };
}

interface TaskInput {
  readonly text: string;
  readonly inputRevision: number;
  readonly attempts: number;
  readonly maxOutputTokens: number;
}

export function runAiTask<Result>(
  ports: AiPorts,
  definition: AiTaskDefinition<Result>,
  input: Readonly<TaskInput>,
  owner: null,
  attempt?: AbortSignal,
): Promise<TaskResult<Result>>;
export function runAiTask<Result>(
  ports: AiPorts,
  definition: AiTaskDefinition<Result>,
  input: Readonly<TaskInput>,
  owner: TaskOwner,
  attempt?: AbortSignal,
): Promise<TaskResult<Result> | ClaimLost>;
export async function runAiTask<Result>(
  ports: AiPorts,
  definition: AiTaskDefinition<Result>,
  input: Readonly<TaskInput>,
  owner: TaskOwner | null,
  attempt?: AbortSignal,
): Promise<TaskResult<Result> | ClaimLost> {
  const loaded = await loadAiConfig(ports);

  if (loaded.state !== "ready") return { ...refusedAi(loaded.state), taskId: null };
  const { config } = loaded;

  if (config.kind === "http" && !ports.ai.allowsUrl(config.baseUrl))
    return { ...refusedAi("refused"), taskId: null };
  const text = definition.prepareInput(input.text);

  const task = await startTask(ports, definition.kind, text, input, originOf(config), owner);

  if (task === null) return CLAIM_LOST;

  if (!ports.ai.providers.includes(config.provider))
    return failTask(ports, task.id, "provider-unavailable");

  return execute(
    ports,
    definition,
    { config, text, taskId: task.id, maxOutputTokens: input.maxOutputTokens },
    attempt,
  );
}

async function execute<Result>(
  ports: AiPorts,
  definition: AiTaskDefinition<Result>,
  {
    config,
    text,
    taskId,
    maxOutputTokens,
  }: Readonly<{ config: AiConnection; text: string; taskId: number; maxOutputTokens: number }>,
  attempt: AbortSignal | undefined,
): Promise<TaskResult<Result>> {
  const deadline = AbortSignal.timeout(AI_DEADLINE_MS);
  const signal = attempt === undefined ? deadline : AbortSignal.any([attempt, deadline]);

  try {
    const result = await ports.ai.run(
      {
        config,
        input: text,
        instructions: definition.instructions,
        schema: definition.schema,
        maxOutputTokens,
      },
      signal,
    );

    if (result.kind !== "done") {
      await failedAiTask(ports.db, taskId, result);

      return { ...result, taskId };
    }

    return { ...result, taskId, provider: config.provider, model: modelOf(config) };
  } catch {
    return failTask(ports, taskId);
  }
}

async function failTask(
  ports: AiPorts,
  taskId: number,
  reason: "unreachable" | "provider-unavailable" = "unreachable",
) {
  const failure = { ...refusedAi(reason), taskId };

  try {
    await failedAiTask(ports.db, taskId, failure);

    return failure;
  } catch {
    return failure;
  }
}

interface TaskOrigin {
  readonly executor: string;
  readonly provider: Provider | null;
  readonly model: string | null;
}

const CALLER_ORIGIN: TaskOrigin = { executor: "caller", provider: null, model: null };

function originOf(config: Readonly<AiConnection>): TaskOrigin {
  return { executor: config.kind, provider: config.provider, model: modelOf(config) };
}

async function startTask(
  ports: AiPorts,
  kind: string,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
  origin: Readonly<TaskOrigin>,
  owner: TaskOwner | null,
) {
  const [task] = await ports.db
    .insert(aiTasks)
    .select(
      ports.db
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<string>`${kind}`.as("kind"),
          inputs: sql<string>`${text}`.as("inputs"),
          inputRevision: sql<number>`${input.inputRevision}`.as("input_revision"),
          executor: sql<string>`${origin.executor}`.as("executor"),
          provider: sql<string | null>`${origin.provider}`.as("provider"),
          model: sql<string | null>`${origin.model}`.as("model"),
          attempts: sql<number>`${input.attempts}`.as("attempts"),
          deadline: sql<number>`${Date.now() + AI_DEADLINE_MS}`.as("deadline"),
          state: sql<"running">`'running'`.as("state"),
          result: sql<null>`null`.as("result"),
          refusal: sql<null>`null`.as("refusal"),
          status: sql<null>`null`.as("status"),
          itemId: sql<number | null>`${owner?.itemId ?? null}`.as("item_id"),
        })
        .from(sql`(select 1)`)
        .where(owner === null ? sql`1` : holding(owner)),
    )
    .returning({ id: aiTasks.id });

  return task ?? null;
}

export async function startCallerTask(
  ports: AiPorts,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
  owner: TaskOwner,
) {
  return (await startTask(ports, "digest", text, input, CALLER_ORIGIN, owner))?.id ?? null;
}
