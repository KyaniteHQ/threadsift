import { z } from "zod";

import {
  PROVIDERS,
  HttpProviderSchema,
  type AiExecution,
  type AiTaskRequest,
  type CliProvider,
  refusedAi,
} from "../../core/ai-contract.ts";
import { allowedAiUrl } from "../../core/ai-url.ts";
import type { AiRuntime, Ports } from "../../core/ports.ts";
import { sealedSecrets } from "../../core/sealed-secret.ts";
import { openRouterExchange } from "./openrouter-exchange.ts";

type TaskRunner = <Result>(
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
) => Promise<AiExecution<Result>>;

export interface CliRunner {
  readonly provider: CliProvider;
  readonly run: TaskRunner;
  readonly signedIn: () => Promise<boolean>;
  readonly stop: () => void;
}

interface AiRuntimeOptions {
  readonly publicOnly: boolean;
  readonly secretKey: string | undefined;
  readonly request: typeof fetch;
  readonly openRouterMaxPriceZero?: string | undefined;
  readonly binding?: TaskRunner | undefined;
  readonly cli?: readonly CliRunner[] | undefined;
}

const HTTP_PROVIDERS = HttpProviderSchema.options;

export async function aiAndSecrets({
  publicOnly,
  secretKey,
  request,
  openRouterMaxPriceZero,
  binding,
  cli = [],
}: AiRuntimeOptions): Promise<Pick<Ports, "ai" | "secrets">> {
  const zeroOpenRouterPrice =
    z.enum(["true", "false"]).default("false").parse(openRouterMaxPriceZero) === "true";

  const secrets = await sealedSecrets(secretKey);

  const ai: AiRuntime = {
    providers: [
      ...HTTP_PROVIDERS,
      ...(binding === undefined ? [] : [PROVIDERS["workers-ai"].id]),
      ...cli.map(({ provider }) => provider),
    ],
    publicOnly,
    allowsUrl: (url) => allowedAiUrl(url, publicOnly),
    signedIn: async () => {
      const states = await Promise.all(
        cli.map(async (runner) => [runner, await runner.signedIn()] as const),
      );

      return states.flatMap(([runner, signedIn]) => (signedIn ? [runner.provider] : []));
    },
    run: async (task, signal) => {
      if (task.config.kind === "binding")
        return binding === undefined ? refusedAi("unreachable") : binding(task, signal);

      if (task.config.kind === "cli") {
        const { provider } = task.config;
        const runner = cli.find((candidate) => candidate.provider === provider);

        return runner === undefined ? refusedAi("not-configured") : runner.run(task, signal);
      }

      const { runHttp } = await import("./ai-executor.ts");

      return runHttp(request, task, signal, zeroOpenRouterPrice);
    },
    exchangeOpenRouterCode: openRouterExchange(request),
  };

  return { ai, secrets };
}
