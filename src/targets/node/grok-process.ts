import { writeFile } from "node:fs/promises";

import { type ProcessEnd, runProcess } from "./cli-process.ts";
import { STDERR_CAP, childPath } from "./cli-support.ts";
import { type RunFolders, sweepGrokTemp, toolListOf } from "./grok-folders.ts";
import type { RunRecord } from "./grok-proof.ts";
import { type SignInLine, signInOf } from "./grok-sign-in.ts";
import { runArguments } from "./grok-surface.ts";

const ANSWER_CAP = 4 * 1024 * 1024;
const LINE_CAP = 16 * 1024;

interface Versioned {
  readonly end: ProcessEnd;
  readonly version: string | null;
}

export interface GrokCli {
  readonly path: string;
  readonly version: (folders: RunFolders, signal: AbortSignal) => Promise<Versioned>;
  readonly signIn: (folders: RunFolders, signal: AbortSignal) => Promise<SignInLine>;
  readonly run: (folders: RunFolders, prompt: string, signal: AbortSignal) => Promise<RunRecord>;
}

type Spawn = (
  folders: RunFolders,
  args: readonly string[],
  signal: AbortSignal,
  stdoutCap: number,
) => Promise<ProcessEnd>;

function spawnerOf(binary: string, authFile: string): Spawn {
  return (folders, args, signal, stdoutCap) =>
    runProcess(
      {
        file: binary,
        args,
        env: {
          PATH: childPath(binary),
          HOME: folders.home,
          GROK_HOME: folders.grokHome,
          GROK_AUTH_PATH: authFile,
          GROK_DISABLE_AUTOUPDATER: "1",
        },
        cwd: folders.cwd,
        stdin: "",
        stdoutCap,
        stderrCap: STDERR_CAP,
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

async function signInWith(
  spawn: Spawn,
  folders: RunFolders,
  signal: AbortSignal,
): Promise<SignInLine> {
  const end = await spawn(folders, ["models"], signal, LINE_CAP);

  return end.kind === "exited" ? signInOf(end.stdout) : "unknown";
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
  const spawn = spawnerOf(binary, authFile);

  return {
    path: binary,
    version: (folders, signal) => versionWith(spawn, folders, signal),
    signIn: (folders, signal) => signInWith(spawn, folders, signal),
    run: (folders, prompt, signal) => runWith(spawn, folders, prompt, signal),
  };
}
