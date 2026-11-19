import type { AiExecution, AiTaskRequest, CliRecommendation } from "../../core/ai-contract.ts";
import type { AiRuntime } from "../../core/ai-runtime.ts";
import type { CliProvider } from "../../core/provider-families.ts";

export type RunnerTask<Result, Kind extends AiTaskRequest<Result>["config"]["kind"]> = Omit<
  AiTaskRequest<Result>,
  "config"
> & {
  readonly config: Extract<AiTaskRequest<Result>["config"], { readonly kind: Kind }>;
};

export type TaskRunner<Kind extends AiTaskRequest<never>["config"]["kind"]> = <Result>(
  task: RunnerTask<Result, Kind>,
  signal: AbortSignal,
) => Promise<AiExecution<Result>>;

export interface CliRunner {
  readonly provider: CliProvider;
  readonly recommendation: CliRecommendation | undefined;
  readonly run: TaskRunner<"cli">;
  readonly resolve: AiRuntime["resolveCli"];
  readonly signedIn: () => Promise<boolean>;
  readonly stop: () => void;
}
