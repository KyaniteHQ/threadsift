import {
  PROVIDERS,
  HttpProviderSchema,
  type AiExecution,
  type AiTaskRequest,
  refusedAi,
} from "../../core/ai-contract.ts";
import { allowedAiUrl } from "../../core/ai-url.ts";
import type { AiRuntime } from "../../core/ports.ts";
import { sealedSecrets } from "../../core/sealed-secret.ts";

type BindingRunner = <Result>(
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
) => Promise<AiExecution<Result>>;

interface AiRuntimeOptions {
  readonly publicOnly: boolean;
  readonly secretKey: string | undefined;
  readonly request: typeof fetch;
  readonly binding?: BindingRunner | undefined;
}

const HTTP_PROVIDERS = HttpProviderSchema.options;

export async function aiRuntime({
  publicOnly,
  secretKey,
  request,
  binding,
}: AiRuntimeOptions): Promise<AiRuntime> {
  return {
    providers:
      binding === undefined ? HTTP_PROVIDERS : [...HTTP_PROVIDERS, PROVIDERS["workers-ai"].id],
    publicOnly,
    allowsUrl: (url) => allowedAiUrl(url, publicOnly),
    secrets: await sealedSecrets(secretKey),
    run: async (task, signal) => {
      if (task.config.kind === "binding")
        return binding === undefined ? refusedAi("unreachable") : binding(task, signal);

      const { runHttp } = await import("./ai-executor.ts");

      return runHttp(request, task, signal);
    },
  };
}
