import type { LoadedFetcher } from "../../core/fetcher.ts";
import type { CliRunner } from "../shared/ai-runtime.ts";
import { type CliEnvironments, startCliRunners } from "./cli-runners.ts";
import { loadFetchers } from "./fetcher-modules.ts";
import { type GrokEnvironment, type StoppableXFetcher, grokXFetcher } from "./grok-x.ts";

export interface OperatorCodeOptions extends CliEnvironments {
  readonly fetchers: string | undefined;
  readonly grok: Readonly<GrokEnvironment>;
}

interface OperatorCode {
  readonly fetchers: readonly LoadedFetcher[];
  readonly cli: readonly CliRunner[];
  readonly xFetcher: StoppableXFetcher | null;
}

export async function startOperatorCode({
  fetchers,
  claude,
  codex,
  grok,
}: Readonly<OperatorCodeOptions>): Promise<OperatorCode> {
  const loaded = await loadFetchers(fetchers);

  return {
    fetchers: loaded,
    cli: await startCliRunners({ claude, codex }),
    xFetcher: await grokXFetcher(grok),
  };
}
