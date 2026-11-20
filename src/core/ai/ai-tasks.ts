import { sql } from "drizzle-orm";

import {
  type AiConnection,
  type ModelAi,
  type AiRefused,
  type AiTaskDefinition,
  AI_DEADLINE_MS,
  modelOf,
  refusedAi,
} from "../contract/ai-contract.ts";
import { within } from "../contract/deadline.ts";
import type { Provider } from "../contract/provider-families.ts";
import { failedAiTask, insertTask } from "../kernel/ai-task-rows.ts";
import { bestEffort } from "../kernel/failure-log.ts";
import { holding } from "../kernel/job-rows.ts";
import type { AiPorts } from "../kernel/ports.ts";
import type { JobRow } from "../kernel/schema.ts";
import { allowsUrl, providersOf, resolveCli, runAi } from "./ai-run.ts";

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

type SavedConfig = Readonly<Extract<ModelAi, { state: "ready" }>["config"]>;

function originOf(config: Readonly<AiConnection>): TaskOrigin {
  return { executor: config.kind, provider: config.provider, model: modelOf(config) };
}

function unavailableOriginOf(config: SavedConfig): TaskOrigin {
  const model = config.kind === "cli" && config.choice !== "custom" ? "" : (config.model ?? "");

  return { executor: config.kind, provider: config.provider, model: modelOf({ model }) };
}

function executionConfig({ ai }: AiPorts, config: SavedConfig) {
  if (!providersOf(ai).includes(config.provider)) return null;

  return config.kind === "cli" ? resolveCli(ai, config) : config;
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

  const config = executionConfig(ports, ai.config);

  if (config?.kind === "refused") return { ...config, taskId: null };
  if (config?.kind === "http" && !allowsUrl(ports.ai, config.baseUrl))
    return { ...refusedAi("refused"), taskId: null };
  const text = definition.prepareInput(input.text);

  const origin = config === null ? unavailableOriginOf(ai.config) : originOf(config);
  const task = await startTask(ports, definition.kind, text, input, origin, owner);

  if (task === null) return CLAIM_LOST;

  if (config === null) return failTask(ports, task.id, "provider-unavailable");

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
  const signal = within(attempt, deadline);

  try {
    const result = await runAi(
      ports.ai,
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

export async function failTask(
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
  kind: string,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
  owner: TaskOwner,
) {
  return (await startTask(ports, kind, text, input, CALLER_ORIGIN, owner))?.id ?? null;
}
