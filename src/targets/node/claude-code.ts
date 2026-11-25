import { homedir } from "node:os";

import { z } from "zod";

import { type AiExecution, apiRefusal, refusedAi } from "../../core/contract/ai-contract.ts";
import { PROVIDERS } from "../../core/contract/provider-families.ts";
import { PROBE_MS } from "../../core/contract/request-waits.ts";
import type { RunnerTask } from "../../core/kernel/ai-runtime.ts";
import { readOrAssume, report } from "../../core/kernel/failure-log.ts";
import { parsedJson } from "../../core/kernel/parsed-json.ts";
import { type SignIn, findBinary, inEmptyFolder, runProcess } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";
import {
  type Attempt,
  STDOUT_CAP,
  SlottedCli,
  exitCode,
  outputSchema,
  promptOf,
} from "./slotted-cli.ts";

export interface ClaudeEnvironment {
  readonly path: string;
  readonly configDir: string | undefined;
  readonly token: string | undefined;
}

const BINARY = "claude";
const SONNET_5_5_VERSION = /^(\d+)\.(\d+)\.(\d+) \(Claude Code\)\s*$/u;
const RECOMMENDED = { model: "claude-sonnet-5-5", effort: "medium" } as const;
const VERSION_UNKNOWN = "claude-version-unknown";

function supportsSonnet55(stdout: string): boolean | null {
  const parts = SONNET_5_5_VERSION.exec(stdout);
  if (parts === null) return null;

  const major = Number(parts[1]);
  const minor = Number(parts[2]);
  const patch = Number(parts[3]);

  return major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 284)));
}

const EnvelopeSchema = z.object({
  is_error: z.boolean(),
  api_error_status: z.number().int().nullable().default(null),
  structured_output: z.unknown().optional(),
});

const StatusSchema = z.object({ loggedIn: z.boolean() });

function present(name: string, value: string | undefined): [string, string][] {
  return value === undefined ? [] : [[name, value]];
}

function taskArguments(
  schema: string,
  { model, effort }: Readonly<RunnerTask<unknown, "cli">["config"]>,
): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    schema,
    "--safe-mode",
    "--tools",
    "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--no-session-persistence",
    ...(effort === undefined ? [] : ["--effort", effort]),
    ...(model === "" ? [] : [`--model=${model}`]),
  ];
}

class ClaudeCode extends SlottedCli {
  readonly provider = PROVIDERS["claude-code"].id;
  readonly recommendation;
  private readonly binary: string;
  private readonly environment: Readonly<ClaudeEnvironment>;

  constructor(
    binary: string,
    environment: Readonly<ClaudeEnvironment>,
    slots: Slots,
    recommendation: typeof RECOMMENDED | undefined,
  ) {
    super(slots);
    this.binary = binary;
    this.environment = environment;
    this.recommendation = recommendation;
  }

  protected modelChoice(slug: string) {
    return { slug, levels: ["low", "medium", "high", "xhigh", "max"] } as const;
  }

  protected async probe(signal: AbortSignal): Promise<SignIn> {
    const end = await this.spawn(["auth", "status", "--json"], "", signal);
    const status = end.kind === "exited" ? parsedJson(StatusSchema, end.stdout) : null;

    if (status === null) return "unknown";

    return status.loggedIn ? "signed-in" : "signed-out";
  }

  protected async attempt<Result>(
    task: RunnerTask<Result, "cli">,
    signal: AbortSignal,
  ): Promise<Attempt<Result>> {
    const end = await this.spawn(
      taskArguments(outputSchema(task.schema), task.config),
      promptOf(task),
      signal,
    );

    const result = this.outcome(end, (exited) => this.answerOf(task.schema, exited));

    return { result, code: exitCode(end) };
  }

  private spawn(args: readonly string[], stdin: string, signal: AbortSignal) {
    return spawnClaude(this.binary, args, this.childEnvironment(), stdin, signal);
  }

  private childEnvironment() {
    const { configDir, token } = this.environment;

    return Object.fromEntries([
      ["HOME", homedir()],
      ["CLAUDE_CODE_DISABLE_ATTACHMENTS", "1"],
      ["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"],
      ...present("CLAUDE_CONFIG_DIR", configDir),
      ...present("CLAUDE_CODE_OAUTH_TOKEN", token),
    ]);
  }

  private answerOf<Result>(
    schema: z.ZodType<Result>,
    { stdout, code }: Readonly<{ stdout: string; code: number | null }>,
  ): AiExecution<Result> | null {
    const envelope = parsedJson(EnvelopeSchema, stdout);

    if (envelope === null) return code === 0 ? refusedAi("no-json") : null;

    if (!envelope.is_error) {
      const parsed = schema.safeParse(envelope.structured_output);

      return parsed.success ? { kind: "done", result: parsed.data } : refusedAi("no-json");
    }

    return envelope.api_error_status === null ? null : apiRefusal(envelope.api_error_status);
  }
}

function spawnClaude(
  binary: string,
  args: readonly string[],
  extraEnv: Readonly<Record<string, string>>,
  stdin: string,
  signal: AbortSignal,
) {
  return inEmptyFolder((cwd) =>
    runProcess(
      { binary, args, extraEnv, cwd, stdin, stdoutCap: STDOUT_CAP, keepStdout: true },
      signal,
    ),
  );
}

async function recommendationOf(binary: string) {
  const version = await spawnClaude(binary, ["--version"], {}, "", AbortSignal.timeout(PROBE_MS));
  const supports =
    version.kind === "exited" && version.code === 0 ? supportsSonnet55(version.stdout) : null;
  if (supports === null) report(VERSION_UNKNOWN, { kind: version.kind, exit: exitCode(version) });

  return supports === true ? RECOMMENDED : undefined;
}

export async function claudeCode(environment: Readonly<ClaudeEnvironment>, slots: Slots) {
  const binary = await findBinary(environment.path, BINARY);

  if (binary === null) return null;

  const recommendation = await readOrAssume(undefined, { event: VERSION_UNKNOWN, fields: {} }, () =>
    recommendationOf(binary),
  );

  return new ClaudeCode(binary, environment, slots, recommendation);
}
