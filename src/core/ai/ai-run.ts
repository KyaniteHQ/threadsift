import {
  type AiExecution,
  type AiTaskRequest,
  type CliAiConnection,
  type CliRecommendation,
  type CliSelection,
  refusedAi,
} from "../contract/ai-contract.ts";
import { allowedAiUrl } from "../contract/ai-url.ts";
import { type CliProvider, type Provider, familiesOf } from "../contract/provider-families.ts";
import type { AiRuntime, CliRunner } from "../kernel/ai-runtime.ts";

function runnerFor({ cli }: Readonly<AiRuntime>, provider: CliProvider): CliRunner | undefined {
  return cli.find((runner) => runner.provider === provider);
}

export function providersOf({ binding, cli }: Readonly<AiRuntime>): readonly Provider[] {
  return [
    ...familiesOf("http").map(({ id }) => id),
    ...(binding === null ? [] : familiesOf("binding").map(({ id }) => id)),
    ...cli.map(({ provider }) => provider),
    ...familiesOf("bot").map(({ id }) => id),
  ];
}

export function recommendationsOf({
  cli,
}: Readonly<AiRuntime>): Readonly<Partial<Record<CliProvider, CliRecommendation>>> {
  return Object.fromEntries(
    cli.flatMap(({ provider, recommendation }) =>
      recommendation === undefined ? [] : [[provider, recommendation] as const],
    ),
  );
}

export function allowsUrl({ publicOnly }: Readonly<AiRuntime>, url: string): boolean {
  return allowedAiUrl(url, publicOnly);
}

export function resolveCli(
  ai: Readonly<AiRuntime>,
  config: Readonly<CliAiConnection>,
): CliSelection {
  return runnerFor(ai, config.provider)?.resolve(config) ?? refusedAi("not-configured");
}

export async function signedIn({ cli }: Readonly<AiRuntime>): Promise<readonly CliProvider[]> {
  const states = await Promise.all(
    cli.map(async (runner) => [runner, await runner.signedIn()] as const),
  );

  return states.flatMap(([runner, isSignedIn]) => (isSignedIn ? [runner.provider] : []));
}

export type AiRunner = <Result>(
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
) => Promise<AiExecution<Result>>;

export async function runAi<Result>(
  ai: Readonly<AiRuntime>,
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
): Promise<AiExecution<Result>> {
  if (task.config.kind === "binding")
    return ai.binding === null
      ? refusedAi("unreachable")
      : ai.binding({ ...task, config: task.config }, signal);

  if (task.config.kind === "cli") {
    const runner = runnerFor(ai, task.config.provider);

    return runner === undefined
      ? refusedAi("not-configured")
      : runner.run({ ...task, config: task.config }, signal);
  }

  const { runHttp } = await import("./ai-executor.ts");

  return runHttp(ai.request, { ...task, config: task.config }, signal, ai.zeroOpenRouterPrice);
}
