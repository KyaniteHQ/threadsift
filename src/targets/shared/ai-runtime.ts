import {
  PROVIDERS,
  HttpProviderSchema,
  type AiExecution,
  type AiTaskRequest,
  type CliProvider,
  refusedAi,
} from "../../core/ai-contract.ts";
import { allowedAiUrl } from "../../core/ai-url.ts";
import type { AiRuntime } from "../../core/ports.ts";
import { sealedSecrets } from "../../core/sealed-secret.ts";

type TaskRunner = <Result>(
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
) => Promise<AiExecution<Result>>;

export interface CliRunner {
  readonly provider: CliProvider;
  readonly run: TaskRunner;
  readonly signedIn: () => Promise<boolean>;
}

interface AiRuntimeOptions {
  readonly publicOnly: boolean;
  readonly secretKey: string | undefined;
  readonly request: typeof fetch;
  readonly binding?: TaskRunner | undefined;
  readonly cli?: CliRunner | undefined;
}

const HTTP_PROVIDERS = HttpProviderSchema.options;

export async function aiRuntime({
  publicOnly,
  secretKey,
  request,
  binding,
  cli,
}: AiRuntimeOptions): Promise<AiRuntime> {
  return {
    providers: [
      ...HTTP_PROVIDERS,
      ...(binding === undefined ? [] : [PROVIDERS["workers-ai"].id]),
      ...(cli === undefined ? [] : [cli.provider]),
    ],
    publicOnly,
    allowsUrl: (url) => allowedAiUrl(url, publicOnly),
    secrets: await sealedSecrets(secretKey),
    signedIn: async () => (cli !== undefined && (await cli.signedIn()) ? [cli.provider] : []),
    run: async (task, signal) => {
      if (task.config.kind === "binding")
        return binding === undefined ? refusedAi("unreachable") : binding(task, signal);

      if (task.config.kind === "cli")
        return cli === undefined ? refusedAi("not-configured") : cli.run(task, signal);

      const { runHttp } = await import("./ai-executor.ts");

      return runHttp(request, task, signal);
    },
  };
}
