import { homedir } from "node:os";

import { z } from "zod";

import {
  type AiExecution,
  type AiTaskRequest,
  PROVIDERS,
  refusedAi,
} from "../../core/ai-contract.ts";
import { apiRefusal } from "../shared/ai-call.ts";
import type { CliRunner } from "../shared/ai-runtime.ts";
import { configuredCode } from "../shared/configured-code.ts";
import { type ProcessEnd, runProcess } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";
import {
  STDERR_CAP,
  STDOUT_CAP,
  answerWithin,
  childPath,
  endRefusal,
  exitCode,
  findBinary,
  inEmptyFolder,
  parsedJson,
  present,
  report,
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

export class ClaudeCode implements CliRunner {
  readonly provider = PROVIDERS["claude-code"].id;
  private readonly shutdown = new AbortController();
  private readonly binary: string;
  private readonly environment: Readonly<ClaudeEnvironment>;
  private readonly slots: Slots;

  constructor(binary: string, environment: Readonly<ClaudeEnvironment>, slots: Slots) {
    this.binary = binary;
    this.environment = environment;
    this.slots = slots;
  }

  stop(): void {
    this.shutdown.abort();
  }

  readonly signedIn = (): Promise<boolean> =>
    answerWithin(this.shutdown.signal, (signal) => this.probe(signal));

  private async probe(signal: AbortSignal): Promise<boolean> {
    const end = await this.spawn(["auth", "status", "--json"], "", signal);

    return end.kind === "exited" && parsedJson(StatusSchema, end.stdout)?.loggedIn === true;
  }

  readonly run = async <Result>(
    task: AiTaskRequest<Result>,
    signal: AbortSignal,
  ): Promise<AiExecution<Result>> => {
    if (task.config.kind !== "cli") return refusedAi("unreachable");
    const stop = AbortSignal.any([signal, this.shutdown.signal]);
    const release = await this.slots.acquire(stop);

    if (release === null) return refusedAi("timeout");

    try {
      const schema = JSON.stringify(z.toJSONSchema(task.schema, { target: "draft-7" }));
      const prompt = `${task.instructions}\n\n${task.input}`;
      const end = await this.spawn(taskArguments(schema, task.config.model), prompt, stop);
      const result = await this.outcome(task.schema, end);

      if (result.kind === "refused") report(this.provider, result.reason, exitCode(end));

      return result;
    } finally {
      release();
    }
  };

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
