import { z } from "zod";

import {
  GROK_BOT_PROVIDER,
  PROVIDERS,
  HttpProviderSchema,
  type CliProvider,
  refusedAi,
} from "../../core/ai-contract.ts";
import type { AiRuntime } from "../../core/ai-runtime.ts";
import { allowedAiUrl } from "../../core/ai-url.ts";
import type { Ports } from "../../core/ports.ts";
import { sealedSecrets } from "../../core/sealed-secret.ts";
import type { CliRunner, TaskRunner } from "./ai-runner.ts";
import { openRouterActivation, openRouterExchange } from "./openrouter-exchange.ts";

interface AiRuntimeOptions {
  readonly publicOnly: boolean;
  readonly secretKey: string | undefined;
  readonly request: typeof fetch;
  readonly openRouterMaxPriceZero?: string | undefined;
  readonly binding?: TaskRunner<"binding"> | undefined;
  readonly cli?: readonly CliRunner[] | undefined;
}

const HTTP_PROVIDERS = HttpProviderSchema.options;

function providersOf(cli: readonly CliRunner[], binding: AiRuntimeOptions["binding"]) {
  return [
    ...HTTP_PROVIDERS,
    ...(binding === undefined ? [] : [PROVIDERS["workers-ai"].id]),
    ...cli.map(({ provider }) => provider),
    GROK_BOT_PROVIDER,
  ];
}

async function signedInProviders(cli: readonly CliRunner[]): Promise<readonly CliProvider[]> {
  const states = await Promise.all(
    cli.map(async (runner) => [runner, await runner.signedIn()] as const),
  );

  return states.flatMap(([runner, signedIn]) => (signedIn ? [runner.provider] : []));
}

function recommendationsOf(cli: readonly CliRunner[]): AiRuntime["recommendations"] {
  return Object.fromEntries(
    cli.flatMap(({ provider, recommendation }) =>
      recommendation === undefined ? [] : [[provider, recommendation] as const],
    ),
  );
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

  const runnerFor = (provider: CliProvider) => cli.find((runner) => runner.provider === provider);

  const ai: AiRuntime = {
    providers: providersOf(cli, binding),
    recommendations: recommendationsOf(cli),
    publicOnly,
    allowsUrl: (url) => allowedAiUrl(url, publicOnly),
    resolveCli: (config) =>
      runnerFor(config.provider)?.resolve(config) ?? refusedAi("not-configured"),
    signedIn: () => signedInProviders(cli),
    run: async (task, signal) => {
      if (task.config.kind === "binding")
        return binding === undefined
          ? refusedAi("unreachable")
          : binding({ ...task, config: task.config }, signal);

      if (task.config.kind === "cli") {
        const { provider } = task.config;
        const runner = runnerFor(provider);

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

  return { ai, secrets: await sealedSecrets(secretKey) };
}
