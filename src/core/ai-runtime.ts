import type {
  AiExecution,
  AiTaskRequest,
  CliAiConnection,
  CliRecommendation,
  CliSelection,
} from "./ai-contract.ts";
import type { CliProvider } from "./provider-families.ts";

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
  readonly resolve: (config: Readonly<CliAiConnection>) => CliSelection;
  readonly signedIn: () => Promise<boolean>;
  readonly stop: () => void;
}

export interface AiRuntime {
  readonly publicOnly: boolean;
  readonly zeroOpenRouterPrice: boolean;
  readonly request: typeof fetch;
  readonly binding: TaskRunner<"binding"> | null;
  readonly cli: readonly CliRunner[];
}
