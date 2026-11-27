import { writeFile } from "node:fs/promises";

import { z } from "zod";

import { CliVersionSchema } from "../../core/contract/x-settings-contract.ts";
import { parsedJson } from "../../core/kernel/parsed-json.ts";
import { type ProcessEnd, runProcess } from "./cli-process.ts";
import { type SignIn, signInFrom } from "./cli-sign-in.ts";
import { type RunFolders, sweepGrokTemp, toolListOf } from "./grok-folders.ts";
import { signInOf } from "./grok-sign-in.ts";
import { type ToolList, runArguments } from "./grok-surface.ts";

const ANSWER_CAP = 4 * 1024 * 1024;
const LINE_CAP = 16 * 1024;

interface Versioned {
  readonly end: ProcessEnd;
  readonly version: string | null;
}

export interface RunRecord {
  readonly end: ProcessEnd;
  readonly tools: ToolList;
}

export interface GrokCli {
  readonly path: string;
  readonly version: (folders: RunFolders, signal: AbortSignal) => Promise<Versioned>;
  readonly signIn: (folders: RunFolders, signal: AbortSignal) => Promise<SignIn>;
  readonly run: (folders: RunFolders, prompt: string, signal: AbortSignal) => Promise<RunRecord>;
}

type Spawn = (
  folders: RunFolders,
  args: readonly string[],
  signal: AbortSignal,
  stdoutCap: number,
) => Promise<ProcessEnd>;

const QUIET = { GROK_DISABLE_AUTOUPDATER: "1" } as const;

function spawnerOf(binary: string, envOf: (folders: RunFolders) => Record<string, string>): Spawn {
  return (folders, args, signal, stdoutCap) =>
    runProcess(
      {
        binary,
        args,
        extraEnv: envOf(folders),
        cwd: folders.cwd,
        stdin: "",
        stdoutCap,
        keepStdout: true,
      },
      signal,
    );
}

async function versionWith(
  spawn: Spawn,
  folders: RunFolders,
  signal: AbortSignal,
): Promise<Versioned> {
  const end = await spawn(folders, ["--version"], signal, LINE_CAP);
  const [line = ""] = (end.kind === "exited" ? end.stdout : "").split("\n");

  return { end, version: line.trim() === "" ? null : line.trim() };
}

async function signInWith(spawn: Spawn, folders: RunFolders, signal: AbortSignal): Promise<SignIn> {
  const end = await spawn(folders, ["models"], signal, LINE_CAP);

  return signInFrom(end, ({ stdout }) => signInOf(stdout));
}

async function runWith(
  spawn: Spawn,
  folders: RunFolders,
  prompt: string,
  signal: AbortSignal,
): Promise<RunRecord> {
  await writeFile(folders.promptFile, prompt);

  const end = await spawn(
    folders,
    runArguments(folders.promptFile, folders.cwd),
    signal,
    ANSWER_CAP,
  );

  const tools = await toolListOf(folders.grokHome);

  await sweepGrokTemp(folders);

  return { end, tools };
}

export function grokCli(binary: string, authFile: string): GrokCli {
  const spawn = spawnerOf(binary, ({ home, grokHome }) => ({
    HOME: home,
    GROK_HOME: grokHome,
    GROK_AUTH_PATH: authFile,
    ...QUIET,
  }));

  return {
    path: binary,
    version: (folders, signal) => versionWith(spawn, folders, signal),
    signIn: (folders, signal) => signInWith(spawn, folders, signal),
    run: (folders, prompt, signal) => runWith(spawn, folders, prompt, signal),
  };
}

const UpdateCheckSchema = z.object({
  latestVersion: CliVersionSchema,
  updateAvailable: z.boolean(),
});

type UpdateCheck = z.output<typeof UpdateCheckSchema>;

function succeeded(end: Readonly<ProcessEnd>): end is Extract<ProcessEnd, { kind: "exited" }> {
  return end.kind === "exited" && end.code === 0;
}

export async function checkForUpdate(
  binary: string,
  folders: RunFolders,
  signal: AbortSignal,
): Promise<UpdateCheck | null> {
  const spawn = spawnerOf(binary, ({ home, grokHome }) => ({ HOME: home, GROK_HOME: grokHome }));
  const end = await spawn(folders, ["update", "--check", "--json"], signal, LINE_CAP);

  return succeeded(end) ? parsedJson(UpdateCheckSchema, end.stdout) : null;
}

export async function updateInto(
  binary: string,
  folders: RunFolders,
  { version, into }: Readonly<{ version: string; into: string }>,
  signal: AbortSignal,
): Promise<boolean> {
  const spawn = spawnerOf(binary, ({ home }) => ({ HOME: home, GROK_HOME: into }));

  return succeeded(await spawn(folders, ["update", "--version", version], signal, LINE_CAP));
}
