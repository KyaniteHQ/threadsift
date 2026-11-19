import { sql } from "drizzle-orm";

import {
  type AiConnection,
  type ModelAi,
  type Provider,
  type AiRefused,
  type AiTaskDefinition,
  AI_DEADLINE_MS,
  BASE_OUTPUT_TOKENS,
  modelOf,
  VERIFY_INPUT,
  ModelDigestSchema,
  refusedAi,
} from "./ai-contract.ts";
import { completedAiTask, failedAiTask, insertTask } from "./ai-task-rows.ts";
import { within } from "./deadline.ts";
import { DIGEST_INSTRUCTIONS, cutDigestInput } from "./digest-prompt.ts";
import { bestEffort } from "./failure-log.ts";
import { holding } from "./job-rows.ts";
import type { AiPorts } from "./ports.ts";
import type { JobRow } from "./schema.ts";

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

type TaskOwner = Readonly<Pick<JobRow, "id" | "attempts" | "attemptGeneration" | "itemId">>;

interface TaskOrigin {
  readonly executor: string;
  readonly provider: Provider | null;
  readonly model: string | null;
}

function originOf(config: Readonly<AiConnection>): TaskOrigin {
  return { executor: config.kind, provider: config.provider, model: modelOf(config) };
}

function startTask(
  ports: AiPorts,
  kind: string,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
  origin: Readonly<TaskOrigin>,
  owner: TaskOwner | null,
) {
  return insertTask(
    ports.db,
    {
      kind,
      inputs: text,
      inputRevision: input.inputRevision,
      attempts: input.attempts,
      deadline: Date.now() + AI_DEADLINE_MS,
      ...origin,
      itemId: owner?.itemId ?? null,
      jobId: null,
      callbackHash: null,
      context: null,
    },
    owner === null ? sql`1` : holding(owner),
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
    return {
      kind: result.kind,
      reason: result.reason,
      status: result.status,
      levels: result.levels,
    };

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
  const available = ports.ai.providers.includes(ai.config.provider);
  const config = executionConfig(ports, ai.config, available);

  if (config.kind === "refused") return { ...config, taskId: null };
  if (config.kind === "http" && !ports.ai.allowsUrl(config.baseUrl))
    return { ...refusedAi("refused"), taskId: null };
  const text = definition.prepareInput(input.text);

  const task = await startTask(ports, definition.kind, text, input, originOf(config), owner);

  if (task === null) return CLAIM_LOST;

  if (!available) return failTask(ports, task.id, "provider-unavailable");

  return execute(
    ports,
    definition,
    { config, text, taskId: task.id, maxOutputTokens: input.maxOutputTokens },
    attempt,
  );
}

function executionConfig(
  { ai }: AiPorts,
  config: Readonly<Extract<ModelAi, { state: "ready" }>["config"]>,
  available: boolean,
) {
  if (config.kind !== "cli") return config;
  if (available) return ai.resolveCli(config);

  return {
    kind: config.kind,
    provider: config.provider,
    model: config.choice === "custom" ? config.model : "",
    effort: undefined,
  } as const;
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
  const signal = within(attempt, deadline);

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

  await bestEffort({ event: "ai-task-failure-not-recorded", fields: { taskId } }, () =>
    failedAiTask(ports.db, taskId, failure),
  );

  return failure;
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
