import { join } from "node:path";

import type { ResolvedCliConnection } from "../../core/ai-contract.ts";
import { type ChildFolders, inChildFolders, runProcess } from "./cli-process.ts";
import { SURFACE_PROMPT, toollessCatalog } from "./codex-protocol.ts";

export interface RunFolders extends ChildFolders {
  readonly schemaFile: string;
  readonly catalogFile: string;
}

const CATALOG_CAP = 8 * 1024 * 1024;
const CATALOG_MS = 30_000;

const DISABLED_FEATURES = ["apps", "plugins", "hooks", "view_image", "goals", "image_generation"];

function sharedArguments(folders: Readonly<RunFolders>): string[] {
  return [
    ...DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
    "-c",
    "web_search=disabled",
    "-c",
    "agents.enabled=false",
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    `model_catalog_json=${JSON.stringify(folders.catalogFile)}`,
  ];
}

function rootArguments(
  folders: Readonly<RunFolders>,
  { model, effort }: Readonly<ResolvedCliConnection>,
): string[] {
  return [
    "-C",
    folders.cwd,
    "--sandbox",
    "read-only",
    ...(effort === undefined ? [] : ["-c", `model_reasoning_effort=${effort}`]),
    ...(model === "" ? [] : [`--model=${model}`]),
  ];
}

const EXEC_FLAGS = [
  "--json",
  "--ephemeral",
  "--skip-git-repo-check",
  "--ignore-user-config",
  "--ignore-rules",
];

export function surfaceArguments(
  folders: Readonly<RunFolders>,
  config: Readonly<ResolvedCliConnection>,
): string[] {
  return [
    ...rootArguments(folders, config),
    "debug",
    "prompt-input",
    ...sharedArguments(folders),
    SURFACE_PROMPT,
  ];
}

export function taskArguments(
  folders: Readonly<RunFolders>,
  config: Readonly<ResolvedCliConnection>,
): string[] {
  return [
    "exec",
    ...EXEC_FLAGS,
    ...rootArguments(folders, config),
    ...sharedArguments(folders),
    "--output-schema",
    folders.schemaFile,
    "-",
  ];
}

export function inRunFolders<Result>(work: (folders: Readonly<RunFolders>) => Promise<Result>) {
  return inChildFolders((folders) =>
    work({
      ...folders,
      schemaFile: join(folders.root, "schema.json"),
      catalogFile: join(folders.root, "models.json"),
    }),
  );
}

export interface Installation {
  readonly binary: string;
  readonly home: string;
}

interface Capture {
  readonly cap: number;
  readonly keep: boolean;
}

export function spawnCodex(
  { binary, home }: Readonly<Installation>,
  folders: Readonly<RunFolders>,
  args: readonly string[],
  stdin: string,
  signal: AbortSignal,
  stdout: Readonly<Capture>,
) {
  return runProcess(
    {
      binary,
      args,
      extraEnv: { HOME: folders.home, CODEX_HOME: home },
      cwd: folders.cwd,
      stdin,
      stdoutCap: stdout.cap,
      keepStdout: stdout.keep,
    },
    signal,
  );
}

export async function bundledCatalog(installation: Readonly<Installation>) {
  const end = await inRunFolders((folders) =>
    spawnCodex(
      installation,
      folders,
      ["debug", "models", "--bundled"],
      "",
      AbortSignal.timeout(CATALOG_MS),
      { cap: CATALOG_CAP, keep: true },
    ),
  );

  return end.kind === "exited" && end.code === 0 ? toollessCatalog(end.stdout) : null;
}
