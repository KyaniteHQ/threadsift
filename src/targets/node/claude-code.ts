import { access, constants, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";

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
import { Slots } from "./cli-slots.ts";

export interface ClaudeEnvironment {
  readonly path: string;
  readonly configDir: string | undefined;
  readonly token: string | undefined;
}

const TASK_LIMIT = 2;
const STDOUT_CAP = 1024 * 1024;
const STDERR_CAP = 64 * 1024;
const PROBE_MS = 15_000;
const BINARY = "claude";
const FIXED_PATH = ["/usr/local/bin", "/usr/bin", "/bin"];

const EnvelopeSchema = z.object({
  is_error: z.boolean(),
  api_error_status: z.number().int().nullable().default(null),
  structured_output: z.unknown().optional(),
});

const StatusSchema = z.object({ loggedIn: z.boolean() });

function parsedJson<Parsed>(schema: z.ZodType<Parsed>, text: string): Parsed | null {
  try {
    return schema.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);

    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function findBinary(path: string): Promise<string | null> {
  const candidates = path
    .split(delimiter)
    .filter((dir) => isAbsolute(dir))
    .map((dir) => join(dir, BINARY));

  const found = await Promise.all(candidates.map((candidate) => isExecutable(candidate)));

  return candidates.find((_candidate, index) => found[index] === true) ?? null;
}

async function inEmptyFolder<Result>(work: (folder: string) => Promise<Result>): Promise<Result> {
  const folder = await mkdtemp(join(tmpdir(), "threadsift-cli-"));

  try {
    return await work(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

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

function present(name: string, value: string | undefined): [string, string][] {
  return value === undefined ? [] : [[name, value]];
}

function exitCode(end: Readonly<ProcessEnd>): number | null {
  return end.kind === "exited" ? end.code : null;
}

export class ClaudeCode implements CliRunner {
  readonly provider = PROVIDERS["claude-code"].id;
  private readonly slots = new Slots(TASK_LIMIT);
  private readonly shutdown = new AbortController();
  private readonly binary: string;
  private readonly environment: Readonly<ClaudeEnvironment>;

  constructor(binary: string, environment: Readonly<ClaudeEnvironment>) {
    this.binary = binary;
    this.environment = environment;
  }

  stop(): void {
    this.shutdown.abort();
  }

  readonly signedIn = async (): Promise<boolean> => {
    const signal = AbortSignal.any([AbortSignal.timeout(PROBE_MS), this.shutdown.signal]);

    try {
      const end = await this.spawn(["auth", "status", "--json"], "", signal);

      return end.kind === "exited" && parsedJson(StatusSchema, end.stdout)?.loggedIn === true;
    } catch {
      return false;
    }
  };

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

      if (result.kind === "refused") report(result.reason, exitCode(end));

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
        },
        signal,
      ),
    );
  }

  private childEnvironment() {
    const { configDir, token } = this.environment;

    return Object.fromEntries([
      ["PATH", [dirname(this.binary), ...FIXED_PATH].join(delimiter)],
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
    switch (end.kind) {
      case "aborted":
        return refusedAi("timeout");
      case "over-cap":
        return refusedAi("no-json");
      case "spawn-failed":
        return refusedAi("not-configured");
      case "exited": {
        const envelope = parsedJson(EnvelopeSchema, end.stdout);

        if (envelope === null) return refusedAi(end.code === 0 ? "no-json" : "unreachable");

        if (!envelope.is_error) {
          const parsed = schema.safeParse(envelope.structured_output);

          return parsed.success ? { kind: "done", result: parsed.data } : refusedAi("no-json");
        }

        if (envelope.api_error_status !== null) return apiRefusal(envelope.api_error_status);

        return refusedAi((await this.signedIn()) ? "unreachable" : "not-configured");
      }

      default: {
        const exhaustive: never = end;

        return exhaustive;
      }
    }
  }
}

function report(reason: string, code: number | null): void {
  console.error(
    JSON.stringify({
      event: "cli-refused",
      provider: PROVIDERS["claude-code"].id,
      reason,
      exit: code,
    }),
  );
}

export async function claudeCode(environment: Readonly<ClaudeEnvironment>) {
  const binary = await findBinary(environment.path);

  return binary === null
    ? null
    : new ClaudeCode(binary, {
        ...environment,
        configDir: configuredCode(environment.configDir),
        token: configuredCode(environment.token),
      });
}
