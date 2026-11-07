import { and, eq, lt } from "drizzle-orm";

import {
  type AiConnection,
  type Provider,
  type AiRefused,
  type AiRefusal,
  type AiTaskDefinition,
  AI_DEADLINE_MS,
  VERIFY_INPUT,
  DIGEST_INSTRUCTIONS,
  DigestSchema,
  cutDigestInput,
  refusedAi,
} from "./ai-contract.ts";
import { loadAiConfig } from "./ai-settings.ts";
import type { AiPorts, Database } from "./ports.ts";
import { aiTasks } from "./schema.ts";

export const TASKS = {
  digest: {
    kind: "digest",
    instructions: DIGEST_INSTRUCTIONS,
    schema: DigestSchema,
    prepareInput: cutDigestInput,
  },
} as const;

export interface DoneTask<Result> {
  readonly kind: "done";
  readonly result: Result;
  readonly taskId: number;
  readonly provider: Provider;
  readonly model: string;
}

type TaskResult<Result> = DoneTask<Result> | (AiRefused & { readonly taskId: number | null });

export function completedAiTask<Result>(
  db: Database,
  task: Readonly<Pick<DoneTask<Result>, "taskId" | "result">>,
) {
  return db
    .update(aiTasks)
    .set({ state: "done", result: JSON.stringify(task.result), refusal: null, status: null })
    .where(eq(aiTasks.id, task.taskId));
}

export function failedAiTask(
  db: Database,
  taskId: number,
  failure: Readonly<{ reason: AiRefusal | "stale" | "lease-lost"; status: number | null }>,
) {
  return failingAiTask(db, failure).where(eq(aiTasks.id, taskId));
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
    { text: VERIFY_INPUT, inputRevision: 1, attempts: 1 },
    attempt,
  );

  if (result.kind === "done") {
    try {
      await completedAiTask(ports.db, result);
    } catch {
      return failTask(ports, result.taskId);
    }
  }

  return result.kind === "done"
    ? { kind: result.kind, digest: result.result, taskId: result.taskId }
    : { kind: result.kind, reason: result.reason, status: result.status };
}

export async function runAiTask<Result>(
  ports: AiPorts,
  definition: AiTaskDefinition<Result>,
  input: Readonly<{ text: string; inputRevision: number; attempts: number }>,
  attempt?: AbortSignal,
): Promise<TaskResult<Result>> {
  const loaded = await loadAiConfig(ports);

  if (loaded.state !== "ready") return { ...refusedAi(loaded.state), taskId: null };
  const { config } = loaded;

  if (config.kind === "http" && !ports.ai.allowsUrl(config.baseUrl))
    return { ...refusedAi("refused"), taskId: null };
  const text = definition.prepareInput(input.text);

  const task = await startTask(ports, definition.kind, text, input, originOf(config));

  if (!ports.ai.providers.includes(config.provider))
    return failTask(ports, task.id, "provider-unavailable");

  const deadline = AbortSignal.timeout(AI_DEADLINE_MS);
  const signal = attempt === undefined ? deadline : AbortSignal.any([attempt, deadline]);

  try {
    const result = await ports.ai.run(
      {
        config,
        input: text,
        instructions: definition.instructions,
        schema: definition.schema,
      },
      signal,
    );

    if (result.kind !== "done") {
      await failedAiTask(ports.db, task.id, result);

      return { ...result, taskId: task.id };
    }

    return {
      ...result,
      taskId: task.id,
      provider: config.provider,
      model: config.model,
    };
  } catch {
    return failTask(ports, task.id);
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

function originOf({ kind, provider, model }: Readonly<AiConnection>): TaskOrigin {
  return { executor: kind, provider, model };
}

async function startTask(
  ports: AiPorts,
  kind: string,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
  origin: Readonly<TaskOrigin>,
) {
  const [task] = await ports.db
    .insert(aiTasks)
    .values({
      kind,
      inputs: text,
      inputRevision: input.inputRevision,
      attempts: input.attempts,
      ...origin,
      deadline: Date.now() + AI_DEADLINE_MS,
      state: "running",
    })
    .returning({ id: aiTasks.id });

  if (task === undefined) throw new Error("AI task was not created");

  return task;
}

export async function startCallerTask(
  ports: AiPorts,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
) {
  return (await startTask(ports, "digest", text, input, CALLER_ORIGIN)).id;
}
