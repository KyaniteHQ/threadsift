import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runProcess } from "./cli-process.ts";
import { STDERR_CAP, childPath, inEmptyFolder } from "./cli-support.ts";
import { SURFACE_PROMPT, toollessCatalog } from "./codex-protocol.ts";

export interface RunFolders {
  readonly cwd: string;
  readonly home: string;
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

function rootArguments(folders: Readonly<RunFolders>, model: string): string[] {
  return [
    "-C",
    folders.cwd,
    "--sandbox",
    "read-only",
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

export function surfaceArguments(folders: Readonly<RunFolders>, model: string): string[] {
  return [
    ...rootArguments(folders, model),
    "debug",
    "prompt-input",
    ...sharedArguments(folders),
    SURFACE_PROMPT,
  ];
}

export function taskArguments(folders: Readonly<RunFolders>, model: string): string[] {
  return [
    "exec",
    ...EXEC_FLAGS,
    ...rootArguments(folders, model),
    ...sharedArguments(folders),
    "--output-schema",
    folders.schemaFile,
    "-",
  ];
}

export function inRunFolders<Result>(work: (folders: Readonly<RunFolders>) => Promise<Result>) {
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

export interface Installation {
  readonly binary: string;
  readonly home: string;
}

export interface Capture {
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
      file: binary,
      args,
      env: { PATH: childPath(binary), HOME: folders.home, CODEX_HOME: home },
      cwd: folders.cwd,
      stdin,
      stdoutCap: stdout.cap,
      stderrCap: STDERR_CAP,
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
