import type { CliRunner } from "../shared/ai-runtime.ts";
import { type ClaudeEnvironment, claudeCode } from "./claude-code.ts";
import { Slots } from "./cli-slots.ts";
import { type CodexEnvironment, codexCli } from "./codex-cli.ts";

export interface CliEnvironments {
  readonly claude: Readonly<ClaudeEnvironment>;
  readonly codex: Readonly<CodexEnvironment>;
}

const TASK_LIMIT = 2;

export async function startCliRunners({
  claude,
  codex,
}: Readonly<CliEnvironments>): Promise<readonly CliRunner[]> {
  const slots = new Slots(TASK_LIMIT);
  const runners = await Promise.all([claudeCode(claude, slots), codexCli(codex, slots)]);

  return runners.filter((runner) => runner !== null);
}
