import { type SQLWrapper, and, eq, sql } from "drizzle-orm";

import {
  type AiConnection,
  type ModelAi,
  type Provider,
  type AiRefused,
  type AiRefusal,
  type AiTaskDefinition,
  AI_DEADLINE_MS,
  BASE_OUTPUT_TOKENS,
  modelOf,
  VERIFY_INPUT,
  ModelDigestSchema,
  refusedAi,
} from "./ai-contract.ts";
import { type TaskOrigin, type TaskOwner, originOf, startTask } from "./ai-task-start.ts";
import { mayComplete, mayExpire, mayFail } from "./bot-task-states.ts";
import { DIGEST_INSTRUCTIONS, cutDigestInput } from "./digest-prompt.ts";
import type { AiPorts, Database } from "./ports.ts";
import { aiTasks } from "./schema.ts";

export const TASKS = {
  digest: {
    kind: "digest",
    instructions: DIGEST_INSTRUCTIONS,
    schema: ModelDigestSchema,
    prepareInput: cutDigestInput,
  },
} as const;

interface DoneTask<Result> {
  readonly kind: "done";
  readonly result: Result;
  readonly taskId: number;
  readonly provider: Provider;
  readonly model: string | null;
}

type TaskResult<Result> = DoneTask<Result> | (AiRefused & { readonly taskId: number | null });

interface ClaimLost {
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
    .where(and(eq(aiTasks.id, task.taskId), eq(aiTasks.state, "running"), mayComplete()));
}

export function aiTaskRunning(taskId: number) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${taskId} and ${aiTasks.state} = 'running')`;
}

export function failedAiTask(
  db: Database,
  taskId: number,
  failure: Readonly<{ reason: AiRefusal | "stale" | "lease-lost"; status: number | null }>,
  claim?: Readonly<SQLWrapper>,
) {
  return failingAiTask(db, failure).where(
    and(
      eq(aiTasks.id, taskId),
      eq(aiTasks.state, "running"),
      mayFail(failure.reason),
      claim && sql`${claim}`,
    ),
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
    and(eq(aiTasks.state, "running"), mayExpire(now)),
  );
}

export async function verifyAi(ports: AiPorts, ai: ModelAi, attempt: AbortSignal) {
  const result = await runAiTask(
    ports,
    ai,
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
  ai: ModelAi,
  definition: AiTaskDefinition<Result>,
  input: Readonly<TaskInput>,
  owner: null,
  attempt?: AbortSignal,
): Promise<TaskResult<Result>>;
export function runAiTask<Result>(
  ports: AiPorts,
  ai: ModelAi,
  definition: AiTaskDefinition<Result>,
  input: Readonly<TaskInput>,
  owner: TaskOwner,
  attempt?: AbortSignal,
): Promise<TaskResult<Result> | ClaimLost>;
export async function runAiTask<Result>(
  ports: AiPorts,
  ai: ModelAi,
  definition: AiTaskDefinition<Result>,
  input: Readonly<TaskInput>,
  owner: TaskOwner | null,
  attempt?: AbortSignal,
): Promise<TaskResult<Result> | ClaimLost> {
  if (ai.state !== "ready") return { ...refusedAi(ai.state), taskId: null };
  const { config } = ai;

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
  }: Readonly<{
    config: AiConnection;
    text: string;
    taskId: number;
    maxOutputTokens: number;
  }>,
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

const CALLER_ORIGIN: TaskOrigin = { executor: "caller", provider: null, model: null };

export async function startCallerTask(
  ports: AiPorts,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
  owner: TaskOwner,
) {
  return (await startTask(ports, "digest", text, input, CALLER_ORIGIN, owner))?.id ?? null;
}
