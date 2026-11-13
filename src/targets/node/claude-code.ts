import { homedir } from "node:os";

import { z } from "zod";

import {
  type AiExecution,
  type AiTaskRequest,
  PROVIDERS,
  refusedAi,
} from "../../core/ai-contract.ts";
import { parsedJson } from "../../core/parsed-json.ts";
import { apiRefusal } from "../shared/ai-call.ts";
import { configuredCode } from "../shared/configured-code.ts";
import { type ProcessEnd, runProcess } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";
import {
  type Attempt,
  STDERR_CAP,
  STDOUT_CAP,
  SlottedCli,
  childPath,
  endRefusal,
  exitCode,
  findBinary,
  inEmptyFolder,
  outputSchema,
  present,
  promptOf,
} from "./cli-support.ts";

export interface ClaudeEnvironment {
  readonly path: string;
  readonly configDir: string | undefined;
  readonly token: string | undefined;
}

const BINARY = "claude";

const EnvelopeSchema = z.object({
  is_error: z.boolean(),
  api_error_status: z.number().int().nullable().default(null),
  structured_output: z.unknown().optional(),
});

const StatusSchema = z.object({ loggedIn: z.boolean() });

function taskArguments(schema: string, model: string): string[] {
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
    ...(model === "" ? [] : [`--model=${model}`]),
  ];
}

class ClaudeCode extends SlottedCli {
  readonly provider = PROVIDERS["claude-code"].id;
  private readonly binary: string;
  private readonly environment: Readonly<ClaudeEnvironment>;

  constructor(binary: string, environment: Readonly<ClaudeEnvironment>, slots: Slots) {
    super(slots);
    this.binary = binary;
    this.environment = environment;
  }

  protected async probe(signal: AbortSignal): Promise<boolean> {
    const end = await this.spawn(["auth", "status", "--json"], "", signal);

    return end.kind === "exited" && parsedJson(StatusSchema, end.stdout)?.loggedIn === true;
  }

  protected async attempt<Result>(
    task: AiTaskRequest<Result>,
    model: string,
    signal: AbortSignal,
  ): Promise<Attempt<Result>> {
    const end = await this.spawn(
      taskArguments(outputSchema(task.schema), model),
      promptOf(task),
      signal,
    );

    return { result: await this.outcome(task.schema, end), code: exitCode(end) };
  }

  private spawn(args: readonly string[], stdin: string, signal: AbortSignal) {
    return inEmptyFolder((cwd) =>
      runProcess(
        {
          file: this.binary,
          args,
          env: this.childEnvironment(),
          cwd,
          stdin,
          stdoutCap: STDOUT_CAP,
          stderrCap: STDERR_CAP,
          keepStdout: true,
        },
        signal,
      ),
    );
  }

  private childEnvironment() {
    const { configDir, token } = this.environment;

    return Object.fromEntries([
      ["PATH", childPath(this.binary)],
      ["HOME", homedir()],
      ["CLAUDE_CODE_DISABLE_ATTACHMENTS", "1"],
      ["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"],
      ...present("CLAUDE_CONFIG_DIR", configDir),
      ...present("CLAUDE_CODE_OAUTH_TOKEN", token),
    ]);
  }

  private async outcome<Result>(
    schema: z.ZodType<Result>,
    end: Readonly<ProcessEnd>,
  ): Promise<AiExecution<Result>> {
    if (end.kind !== "exited") return endRefusal(end);

    const envelope = parsedJson(EnvelopeSchema, end.stdout);

    if (envelope === null) return refusedAi(end.code === 0 ? "no-json" : "unreachable");

    if (!envelope.is_error) {
      const parsed = schema.safeParse(envelope.structured_output);

      return parsed.success ? { kind: "done", result: parsed.data } : refusedAi("no-json");
    }

    if (envelope.api_error_status !== null) return apiRefusal(envelope.api_error_status);

    return refusedAi((await this.signedIn()) ? "unreachable" : "not-configured");
  }
}

export async function claudeCode(environment: Readonly<ClaudeEnvironment>, slots: Slots) {
  const binary = await findBinary(environment.path, BINARY);

  return binary === null
    ? null
    : new ClaudeCode(
        binary,
        {
          ...environment,
          configDir: configuredCode(environment.configDir),
          token: configuredCode(environment.token),
        },
        slots,
      );
}
