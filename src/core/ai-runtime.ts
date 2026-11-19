import type {
  AiExecution,
  AiTaskRequest,
  CliAiConnection,
  CliSelection,
  CliRecommendation,
} from "./ai-contract.ts";
import type { OpenRouterExchange } from "./openrouter-contract.ts";
import type { CliProvider, Provider } from "./provider-families.ts";

export interface AiRuntime {
  readonly providers: readonly Provider[];
  readonly recommendations: Readonly<Partial<Record<CliProvider, CliRecommendation>>>;
  readonly publicOnly: boolean;
  readonly allowsUrl: (url: string) => boolean;
  readonly resolveCli: (config: Readonly<CliAiConnection>) => CliSelection;
  readonly signedIn: () => Promise<readonly CliProvider[]>;
  readonly run: <Result>(
    task: AiTaskRequest<Result>,
    signal: AbortSignal,
  ) => Promise<AiExecution<Result>>;
  readonly exchangeOpenRouterCode: (
    input: Readonly<{ code: string; verifier: string }>,
    signal: AbortSignal,
  ) => Promise<OpenRouterExchange>;
  readonly awaitOpenRouterActivation: (key: string) => Promise<boolean>;
}
