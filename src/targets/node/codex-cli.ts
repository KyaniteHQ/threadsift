import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type AiExecution,
  type AiTaskRequest,
  PROVIDERS,
  refusedAi,
} from "../../core/ai-contract.ts";
import type { CliRunner } from "../shared/ai-runtime.ts";
import { type ProcessEnd, runProcess } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";
import {
  PROBE_MS,
  STDERR_CAP,
  STDOUT_CAP,
  childPath,
  endRefusal,
  exitCode,
  findBinary,
  inEmptyFolder,
  report,
} from "./cli-support.ts";
import { codexHomeOf, reserveCodexHome } from "./codex-home.ts";
import {
  UNKNOWN_MODEL_REFUSAL,
  listsModel,
  outputSchema,
  readCatalog,
  readOutcome,
  toolless,
} from "./codex-protocol.ts";

export interface CodexEnvironment {
  readonly path: string;
  readonly home: string | undefined;
  readonly dataDir: string;
}

interface RunFolders {
  readonly cwd: string;
  readonly home: string;
  readonly schemaFile: string;
  readonly catalogFile: string;
}

const BINARY = "codex";
const CATALOG_CAP = 8 * 1024 * 1024;

const DISABLED_FEATURES = ["apps", "plugins", "hooks", "view_image", "goals", "image_generation"];

function taskArguments(folders: Readonly<RunFolders>, model: string): string[] {
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--sandbox",
    "read-only",
    ...DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
    "-c",
    "web_search=disabled",
    "-c",
    "agents.enabled=false",
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    `model_catalog_json=${JSON.stringify(folders.catalogFile)}`,
    "--output-schema",
    folders.schemaFile,
    "-C",
    folders.cwd,
    ...(model === "" ? [] : [`--model=${model}`]),
    "-",
  ];
}

function inRunFolders<Result>(work: (folders: Readonly<RunFolders>) => Promise<Result>) {
  return inEmptyFolder(async (folder) => {
    const folders = {
      cwd: join(folder, "cwd"),
      home: join(folder, "home"),
      schemaFile: join(folder, "schema.json"),
      catalogFile: join(folder, "models.json"),
    };

    await Promise.all([mkdir(folders.cwd), mkdir(folders.home)]);

    return work(folders);
  });
}

export class CodexCli implements CliRunner {
  readonly provider = PROVIDERS.codex.id;
  private readonly shutdown = new AbortController();
  private readonly binary: string;
  private readonly home: string;
  private readonly slots: Slots;

  constructor(binary: string, home: string, slots: Slots) {
    this.binary = binary;
    this.home = home;
    this.slots = slots;
  }

  stop(): void {
    this.shutdown.abort();
  }

  readonly signedIn = async (): Promise<boolean> => {
    const signal = AbortSignal.any([AbortSignal.timeout(PROBE_MS), this.shutdown.signal]);

    try {
      const end = await inRunFolders((folders) =>
        this.spawn(folders, ["login", "status"], "", signal, { cap: STDOUT_CAP, keep: false }),
      );

      return end.kind === "exited" && end.code === 0;
    } catch {
      return false;
    }
  };

  readonly run = async <Result>(
    task: AiTaskRequest<Result>,
    signal: AbortSignal,
  ): Promise<AiExecution<Result>> => {
    if (task.config.kind !== "cli") return refusedAi("unreachable");
    const { model } = task.config;
    const stop = AbortSignal.any([signal, this.shutdown.signal]);
    const release = await this.slots.acquire(stop);

    if (release === null) return refusedAi("timeout");

    try {
      const { result, code } = await inRunFolders((folders) =>
        this.attempt(task, model, folders, stop),
      );

      if (result.kind === "refused") report(this.provider, result.reason, code);

      return result;
    } finally {
      release();
    }
  };

  private async attempt<Result>(
    task: AiTaskRequest<Result>,
    model: string,
    folders: Readonly<RunFolders>,
    signal: AbortSignal,
  ) {
    const listed = await this.spawn(folders, ["debug", "models", "--bundled"], "", signal, {
      cap: CATALOG_CAP,
      keep: true,
    });

    if (listed.kind !== "exited") return { result: endRefusal(listed), code: null };

    const catalog = readCatalog(listed.stdout);

    if (listed.code !== 0 || catalog === null)
      return { result: refusedAi("unreachable"), code: exitCode(listed) };

    if (model !== "" && !listsModel(catalog, model))
      return { result: UNKNOWN_MODEL_REFUSAL, code: null };

    await Promise.all([
      writeFile(folders.catalogFile, toolless(catalog)),
      writeFile(folders.schemaFile, outputSchema(task.schema)),
    ]);

    const end = await this.spawn(
      folders,
      taskArguments(folders, model),
      `${task.instructions}\n\n${task.input}`,
      signal,
      { cap: STDOUT_CAP, keep: true },
    );

    return { result: await this.outcome(task.schema, end), code: exitCode(end) };
  }

  private spawn(
    folders: Readonly<RunFolders>,
    args: readonly string[],
    stdin: string,
    signal: AbortSignal,
    stdout: Readonly<{ cap: number; keep: boolean }>,
  ) {
    return runProcess(
      {
        file: this.binary,
        args,
        env: {
          PATH: childPath(this.binary),
          HOME: folders.home,
          CODEX_HOME: this.home,
        },
        cwd: folders.cwd,
        stdin,
        stdoutCap: stdout.cap,
        stderrCap: STDERR_CAP,
        keepStdout: stdout.keep,
      },
      signal,
    );
  }

  private async outcome<Result>(
    schema: AiTaskRequest<Result>["schema"],
    end: Readonly<ProcessEnd>,
  ): Promise<AiExecution<Result>> {
    if (end.kind !== "exited") return endRefusal(end);

    return (
      readOutcome(schema, end.stdout, end.code) ??
      refusedAi((await this.signedIn()) ? "unreachable" : "not-configured")
    );
  }
}

export async function codexCli(environment: Readonly<CodexEnvironment>, slots: Slots) {
  const binary = await findBinary(environment.path, BINARY);

  if (binary === null) return null;

  const home = codexHomeOf(environment);
  const refused = await reserveCodexHome(home);

  if (refused !== null) {
    console.error(JSON.stringify({ event: "codex-home-refused", path: refused }));

    return null;
  }

  return new CodexCli(binary, home, slots);
}
