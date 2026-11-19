import type { AiRefused, ModelAi } from "./ai-contract.ts";
import { publishedOutcome } from "./ai-kind-publish.ts";
import type { AiKindDeclaration } from "./ai-kind-types.ts";
import { runAiTask } from "./ai-tasks.ts";
import type { Database } from "./database.ts";
import { report } from "./failure-log.ts";
import { lostClaim, refusalOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";

type Refused<Context, Result, Basis> = Readonly<{
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>;
  job: Readonly<ClaimedJob>;
  context: Context;
  result: Readonly<AiRefused & { readonly taskId: number | null }>;
}>;

async function refusedOutcome<Context, Result, Basis>(
  db: Database,
  { declaration, job, context, result }: Refused<Context, Result, Basis>,
) {
  const refusal = declaration.refused?.(db, context, result.reason);

  const outcome = await refusalOutcome(db, job, {
    result,
    current: declaration.current(context),
    label: declaration.label,
    writes: refusal?.writes ?? [],
  });

  if (refusal?.event !== undefined) report(refusal.event, { reason: result.reason });

  return outcome;
}

export function modelAttempt<Context, Result, Basis>(
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>,
) {
  return async (ports: JobPorts, job: Readonly<ClaimedJob>, ai: ModelAi): Promise<JobOutcome> => {
    const prepared = await declaration.prepare(ports, job);

    if (prepared.kind === "settled") return prepared.outcome;

    const { context } = prepared;

    const result = await runAiTask(
      ports,
      ai,
      declaration.task(context),
      {
        text: prepared.input,
        inputRevision: prepared.inputRevision,
        attempts: job.attempts + 1,
        maxOutputTokens: prepared.maxOutputTokens,
      },
      job,
    );

    if (result.kind === "claim-lost") return lostClaim(ports.db);

    if (result.taskId !== null) prepared.started?.(result.taskId);

    if (result.kind !== "done") {
      return refusedOutcome(ports.db, { declaration, job, context, result });
    }

    return publishedOutcome(ports.db, declaration, {
      context,
      result: result.result,
      taskId: result.taskId,
      by: { provider: result.provider, model: result.model },
      executor: "model",
      basis: prepared.basis,
    });
  };
}
