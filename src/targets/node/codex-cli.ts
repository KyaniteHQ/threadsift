import { writeFile } from "node:fs/promises";

import {
  type AiExecution,
  type AiTaskRequest,
  PROVIDERS,
  refusedAi,
} from "../../core/ai-contract.ts";
import type { ProcessEnd } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";
import {
  type Attempt,
  STDOUT_CAP,
  SlottedCli,
  endRefusal,
  exitCode,
  findBinary,
  outputSchema,
  promptOf,
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

class CodexCli extends SlottedCli {
  readonly provider = PROVIDERS.codex.id;
  private readonly installation: Readonly<Installation>;
  private readonly catalog: Readonly<ToollessCatalog>;

  constructor(
    installation: Readonly<Installation>,
    catalog: Readonly<ToollessCatalog>,
    slots: Slots,
  ) {
    super(slots);
    this.installation = installation;
    this.catalog = catalog;
  }

  protected async probe(signal: AbortSignal): Promise<boolean> {
    const end = await inRunFolders((folders) =>
      this.spawn(folders, ["login", "status"], "", signal, { cap: STDOUT_CAP, keep: false }),
    );

    return end.kind === "exited" && end.code === 0;
  }

  protected override refusalBeforeSlot(model: string) {
    return model !== "" && !this.catalog.slugs.includes(model) ? UNKNOWN_MODEL_REFUSAL : null;
  }

  protected attempt<Result>(
    task: AiTaskRequest<Result>,
    model: string,
    signal: AbortSignal,
  ): Promise<Attempt<Result>> {
    return inRunFolders(async (folders) => {
      await Promise.all([
        writeFile(folders.catalogFile, this.catalog.bytes),
        writeFile(folders.schemaFile, outputSchema(task.schema)),
      ]);

      const unsafe = await this.unsafeSurface(folders, model, signal);

      if (unsafe !== null) return { result: unsafe, code: null };

      const end = await this.spawn(folders, taskArguments(folders, model), promptOf(task), signal, {
        cap: STDOUT_CAP,
        keep: true,
      });

      return { result: await this.outcome(task.schema, end), code: exitCode(end) };
    });
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
