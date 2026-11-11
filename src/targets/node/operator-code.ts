import type { LoadedFetcher } from "../../core/fetcher.ts";
import type { CliRunner } from "../shared/ai-runtime.ts";
import { type CliEnvironments, startCliRunners } from "./cli-runners.ts";
import { loadFetchers } from "./fetcher-modules.ts";

export interface OperatorCodeOptions extends CliEnvironments {
  readonly fetchers: string | undefined;
}

interface OperatorCode {
  readonly fetchers: readonly LoadedFetcher[];
  readonly cli: readonly CliRunner[];
}

export async function startOperatorCode({
  fetchers,
  claude,
  codex,
}: Readonly<OperatorCodeOptions>): Promise<OperatorCode> {
  const loaded = await loadFetchers(fetchers);

  return { fetchers: loaded, cli: await startCliRunners({ claude, codex }) };
}
