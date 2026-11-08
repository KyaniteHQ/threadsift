import { writeFile } from "node:fs/promises";

import {
  type AiExecution,
  type AiTaskRequest,
  PROVIDERS,
  refusedAi,
} from "../../core/ai-contract.ts";
import type { CliRunner } from "../shared/ai-runtime.ts";
import type { ProcessEnd } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";
import {
  STDOUT_CAP,
  answerWithin,
  endRefusal,
  exitCode,
  findBinary,
  report,
} from "./cli-support.ts";
import { codexHomeOf, reserveCodexHome } from "./codex-home.ts";
import {
  type Capture,
  type Installation,
  type RunFolders,
  bundledCatalog,
  inRunFolders,
  spawnCodex,
  surfaceArguments,
  taskArguments,
} from "./codex-process.ts";
import {
  type ToollessCatalog,
  UNKNOWN_MODEL_REFUSAL,
  outputSchema,
  readOutcome,
  surfaceOf,
} from "./codex-protocol.ts";

const BINARY = "codex";
const SURFACE_MS = 60_000;

function reportSurface(extraTools: readonly string[], foreignTexts: number): void {
  console.error(JSON.stringify({ event: "codex-surface-refused", extraTools, foreignTexts }));
}

export interface CodexEnvironment {
  readonly path: string;
  readonly home: string | undefined;
  readonly dataDir: string;
}

export class CodexCli implements CliRunner {
  readonly provider = PROVIDERS.codex.id;
  private readonly shutdown = new AbortController();
  private readonly installation: Readonly<Installation>;
  private readonly catalog: Readonly<ToollessCatalog>;
  private readonly slots: Slots;

  constructor(
    installation: Readonly<Installation>,
    catalog: Readonly<ToollessCatalog>,
    slots: Slots,
  ) {
    this.installation = installation;
    this.catalog = catalog;
    this.slots = slots;
  }

  stop(): void {
    this.shutdown.abort();
  }

  readonly signedIn = (): Promise<boolean> =>
    answerWithin(this.shutdown.signal, (signal) => this.probe(signal));

  private async probe(signal: AbortSignal): Promise<boolean> {
    const end = await inRunFolders((folders) =>
      this.spawn(folders, ["login", "status"], "", signal, { cap: STDOUT_CAP, keep: false }),
    );

    return end.kind === "exited" && end.code === 0;
  }

  readonly run = async <Result>(
    task: AiTaskRequest<Result>,
    signal: AbortSignal,
  ): Promise<AiExecution<Result>> => {
    if (task.config.kind !== "cli") return refusedAi("unreachable");
    const { model } = task.config;

    if (model !== "" && !this.catalog.slugs.includes(model)) return UNKNOWN_MODEL_REFUSAL;
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
    await Promise.all([
      writeFile(folders.catalogFile, this.catalog.bytes),
      writeFile(folders.schemaFile, outputSchema(task.schema)),
    ]);

    const unsafe = await this.unsafeSurface(folders, model, signal);

    if (unsafe !== null) return { result: unsafe, code: null };

    const end = await this.spawn(
      folders,
      taskArguments(folders, model),
      `${task.instructions}\n\n${task.input}`,
      signal,
      { cap: STDOUT_CAP, keep: true },
    );

    return { result: await this.outcome(task.schema, end), code: exitCode(end) };
  }

  private async unsafeSurface(folders: Readonly<RunFolders>, model: string, signal: AbortSignal) {
    const end = await this.spawn(
      folders,
      surfaceArguments(folders, model),
      "",
      AbortSignal.any([signal, AbortSignal.timeout(SURFACE_MS)]),
      { cap: STDOUT_CAP, keep: true },
    );

    if (end.kind !== "exited") return endRefusal(end);

    const surface = end.code === 0 ? surfaceOf(end.stdout) : null;

    if (surface === null) return refusedAi("unreachable");

    if (surface.extraTools.length === 0 && surface.foreignTexts === 0) return null;
    reportSurface(surface.extraTools, surface.foreignTexts);

    return refusedAi("provider-unavailable");
  }

  private spawn(
    folders: Readonly<RunFolders>,
    args: readonly string[],
    stdin: string,
    signal: AbortSignal,
    stdout: Readonly<Capture>,
  ) {
    return spawnCodex(this.installation, folders, args, stdin, signal, stdout);
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

  const installation = { binary, home };
  const catalog = await bundledCatalog(installation);

  if (catalog === null) {
    console.error(JSON.stringify({ event: "codex-catalog-refused" }));

    return null;
  }

  return new CodexCli(installation, catalog, slots);
}
