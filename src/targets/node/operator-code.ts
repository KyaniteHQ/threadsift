import type { CliRunner } from "../../core/kernel/ai-runtime.ts";
import type { LoadedFetcher } from "../../core/kernel/fetcher.ts";
import { CAPACITY } from "./capacity.ts";
import { type ClaudeEnvironment, claudeCode } from "./claude-code.ts";
import { Slots } from "./cli-slots.ts";
import { type CodexEnvironment, codexCli } from "./codex-cli.ts";
import { loadFetchers } from "./fetcher-modules.ts";
import { type GrokEnvironment, type StoppableXFetcher, grokXFetcher } from "./grok-x.ts";

export interface OperatorCodeOptions {
  readonly claude: Readonly<ClaudeEnvironment>;
  readonly codex: Readonly<CodexEnvironment>;
  readonly fetchers: string | undefined;
  readonly grok: Readonly<GrokEnvironment>;
}

interface OperatorCode {
  readonly fetchers: readonly LoadedFetcher[];
  readonly cli: readonly CliRunner[];
  readonly xFetcher: StoppableXFetcher | null;
  readonly stop: () => void;
}

export async function startOperatorCode({
  fetchers,
  claude,
  codex,
  grok,
}: Readonly<OperatorCodeOptions>): Promise<OperatorCode> {
  const loaded = await loadFetchers(fetchers);
  const slots = new Slots(CAPACITY.cliTasks);
  const runners = await Promise.all([claudeCode(claude, slots), codexCli(codex, slots)]);
  const cli = runners.filter((runner) => runner !== null);
  const xFetcher = await grokXFetcher(grok);

  return {
    fetchers: loaded,
    cli,
    xFetcher,
    stop: () => {
      for (const runner of cli) runner.stop();

      xFetcher?.stop();
    },
  };
}
