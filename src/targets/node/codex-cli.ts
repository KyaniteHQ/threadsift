import { writeFile } from "node:fs/promises";

import { refusedAi } from "../../core/contract/ai-contract.ts";
import { PROVIDERS } from "../../core/contract/provider-families.ts";
import type { RunnerTask } from "../../core/kernel/ai-runtime.ts";
import { report } from "../../core/kernel/failure-log.ts";
import { findBinary } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";
import { codexHomeOf, reserveCodexHome } from "./codex-home.ts";
import {
  type Installation,
  type RunFolders,
  bundledCatalog,
  inRunFolders,
  spawnCodex,
  surfaceArguments,
  taskArguments,
} from "./codex-process.ts";
import { type ToollessCatalog, readOutcome, surfaceOf } from "./codex-protocol.ts";
import {
  type Attempt,
  STDOUT_CAP,
  SlottedCli,
  endRefusal,
  exitCode,
  outputSchema,
  promptOf,
} from "./slotted-cli.ts";

const BINARY = "codex";
const SURFACE_MS = 60_000;
const RECOMMENDED = { model: "gpt-6.2-sol", effort: "medium" } as const;

export interface CodexEnvironment {
  readonly path: string;
  readonly home: string | undefined;
  readonly dataDir: string;
}

class CodexCli extends SlottedCli {
  readonly provider = PROVIDERS.codex.id;
  readonly recommendation;
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
    this.recommendation =
      this.modelChoice(RECOMMENDED.model)?.levels.includes(RECOMMENDED.effort) === true
        ? RECOMMENDED
        : undefined;
  }

  protected async probe(signal: AbortSignal): Promise<boolean> {
    const end = await inRunFolders((folders) =>
      spawnCodex(this.installation, folders, ["login", "status"], "", signal, {
        cap: STDOUT_CAP,
        keep: false,
      }),
    );

    return end.kind === "exited" && end.code === 0;
  }

  protected modelChoice(model: string) {
    return model === ""
      ? this.catalog.models.find((choice) => choice.visible)
      : this.catalog.models.find(({ slug }) => slug === model);
  }

  protected attempt<Result>(
    task: RunnerTask<Result, "cli">,
    signal: AbortSignal,
  ): Promise<Attempt<Result>> {
    return inRunFolders(async (folders) => {
      await Promise.all([
        writeFile(folders.catalogFile, this.catalog.bytes),
        writeFile(folders.schemaFile, outputSchema(task.schema)),
      ]);

      const unsafe = await this.unsafeSurface(folders, task.config, signal);

      if (unsafe !== null) return { result: unsafe, code: null };

      const end = await spawnCodex(
        this.installation,
        folders,
        taskArguments(folders, task.config),
        promptOf(task),
        signal,
        {
          cap: STDOUT_CAP,
          keep: true,
        },
      );

      const result = await this.outcome(end, signal, ({ stdout, code }) =>
        readOutcome(task.schema, stdout, code),
      );

      return { result, code: exitCode(end) };
    });
  }

  private async unsafeSurface(
    folders: Readonly<RunFolders>,
    config: RunnerTask<unknown, "cli">["config"],
    signal: AbortSignal,
  ) {
    const end = await spawnCodex(
      this.installation,
      folders,
      surfaceArguments(folders, config),
      "",
      AbortSignal.any([signal, AbortSignal.timeout(SURFACE_MS)]),
      { cap: STDOUT_CAP, keep: true },
    );

    if (end.kind !== "exited") return endRefusal(end);

    const surface = end.code === 0 ? surfaceOf(end.stdout) : null;

    if (surface === null) return refusedAi("unreachable");

    if (surface.extraTools.length === 0 && surface.foreignTexts === 0) return null;
    report("codex-surface-refused", {
      extraTools: surface.extraTools,
      foreignTexts: surface.foreignTexts,
    });

    return refusedAi("provider-unavailable");
  }
}

export async function codexCli(environment: Readonly<CodexEnvironment>, slots: Slots) {
  const binary = await findBinary(environment.path, BINARY);

  if (binary === null) return null;

  const home = codexHomeOf(environment);
  const refused = await reserveCodexHome(home);

  if (refused !== null) {
    report("codex-home-refused", { path: refused });

    return null;
  }

  const installation = { binary, home };
  const catalog = await bundledCatalog(installation);

  if (catalog === null) {
    report("codex-catalog-refused", {});

    return null;
  }

  return new CodexCli(installation, catalog, slots);
}
