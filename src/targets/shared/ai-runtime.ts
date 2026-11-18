import { z } from "zod";

import {
  GROK_BOT_PROVIDER,
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
import { openRouterActivation, openRouterExchange } from "./openrouter-exchange.ts";

export type RunnerTask<Result, Kind extends AiTaskRequest<Result>["config"]["kind"]> = Omit<
  AiTaskRequest<Result>,
  "config"
> & {
  readonly config: Extract<AiTaskRequest<Result>["config"], { readonly kind: Kind }>;
};

type TaskRunner<Kind extends AiTaskRequest<never>["config"]["kind"]> = <Result>(
  task: RunnerTask<Result, Kind>,
  signal: AbortSignal,
) => Promise<AiExecution<Result>>;

export interface CliRunner {
  readonly provider: CliProvider;
  readonly run: TaskRunner<"cli">;
  readonly effortLevels: (model: string) => readonly string[];
  readonly signedIn: () => Promise<boolean>;
  readonly stop: () => void;
}

interface AiRuntimeOptions {
  readonly publicOnly: boolean;
  readonly secretKey: string | undefined;
  readonly request: typeof fetch;
  readonly openRouterMaxPriceZero?: string | undefined;
  readonly binding?: TaskRunner<"binding"> | undefined;
  readonly cli?: readonly CliRunner[] | undefined;
}

const HTTP_PROVIDERS = HttpProviderSchema.options;

async function signedInProviders(cli: readonly CliRunner[]): Promise<readonly CliProvider[]> {
  const states = await Promise.all(
    cli.map(async (runner) => [runner, await runner.signedIn()] as const),
  );

  return states.flatMap(([runner, signedIn]) => (signedIn ? [runner.provider] : []));
}

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
      GROK_BOT_PROVIDER,
    ],
    publicOnly,
    allowsUrl: (url) => allowedAiUrl(url, publicOnly),
    effortLevels: (provider, model) =>
      cli.find((runner) => runner.provider === provider)?.effortLevels(model) ?? [],
    signedIn: () => signedInProviders(cli),
    run: async (task, signal) => {
      if (task.config.kind === "binding")
        return binding === undefined
          ? refusedAi("unreachable")
          : binding({ ...task, config: task.config }, signal);

      if (task.config.kind === "cli") {
        const { provider } = task.config;
        const runner = cli.find((candidate) => candidate.provider === provider);

        return runner === undefined
          ? refusedAi("not-configured")
          : runner.run({ ...task, config: task.config }, signal);
      }

      const { runHttp } = await import("./ai-executor.ts");

      return runHttp(request, { ...task, config: task.config }, signal, zeroOpenRouterPrice);
    },
    exchangeOpenRouterCode: openRouterExchange(request),
    awaitOpenRouterActivation: openRouterActivation(request),
  };

  return { ai, secrets };
}
