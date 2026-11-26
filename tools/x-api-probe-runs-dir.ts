import { spawnSync } from "node:child_process";
import { promises as fs, lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { errnoCodeOf } from "../src/core/kernel/failure-log.ts";
import { Refusal } from "./x-api-probe-plan.ts";

const NAME = "X_API_RUNS_DIR";

function entryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (errnoCodeOf(error) === "ENOENT") return false;
    throw new Refusal(`${NAME} cannot be read (${errnoCodeOf(error)})`);
  }
}

function realFolderOf(path: string): string {
  try {
    const real = realpathSync(path);

    if (!statSync(real).isDirectory()) throw new Refusal(`${NAME} passes through a file`);
    return real;
  } catch (error) {
    if (error instanceof Refusal) throw error;
    throw new Refusal(
      `${NAME} passes through a link whose target cannot be read (${errnoCodeOf(error)})`,
    );
  }
}

function nearestExisting(path: string) {
  const rest: string[] = [];
  let folder = path;

  while (!entryExists(folder)) {
    rest.unshift(basename(folder));
    folder = dirname(folder);
  }
  return { folder: realFolderOf(folder), rest };
}

function gitEnvironment(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    LC_ALL: "C",
  };
}

function git(folder: string, args: readonly string[], input = "") {
  const result = spawnSync("git", ["-C", folder, ...args], {
    encoding: "utf8",
    env: gitEnvironment(),
    input,
  });

  if (result.error !== undefined)
    throw new Refusal(
      `git could not run (${errnoCodeOf(result.error)}), so ${NAME} cannot be checked`,
    );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function refuseUnlessIgnored(folder: string, files: readonly string[]): void {
  const ignored = git(
    folder,
    ["check-ignore", "-z", "--stdin"],
    files.map((file) => `${file}\0`).join(""),
  );

  if (ignored.status !== 0 && ignored.status !== 1)
    throw new Refusal(`git could not tell whether ${NAME} is ignored`);
  const listed = new Set(ignored.stdout.split("\0").filter((path) => path !== ""));

  if (files.some((file) => !listed.has(file)))
    throw new Refusal(
      `${NAME} is inside a git work tree and git does not ignore every file the run writes there; use the owner's private folder or a folder outside every checkout`,
    );
}

export function runFolderOf(raw: string, folderName: string, fileNames: readonly string[]): string {
  if (!isAbsolute(raw)) throw new Refusal(`${NAME} must be an absolute path`);
  const { folder, rest } = nearestExisting(resolve(raw));
  const runFolder = join(folder, ...rest, folderName);
  const where = git(folder, ["rev-parse", "--is-inside-git-dir", "--is-inside-work-tree"]);

  if (where.status !== 0) {
    if (where.stderr.includes("not a git repository")) return runFolder;
    throw new Refusal(`git could not tell whether ${NAME} is inside a work tree`);
  }
  const [insideGitDir, insideWorkTree] = where.stdout.trim().split("\n");

  if (insideGitDir !== "false") throw new Refusal(`${NAME} is inside a .git folder`);
  if (insideWorkTree === "true")
    refuseUnlessIgnored(
      folder,
      fileNames.map((name) => join(runFolder, name)),
    );
  return runFolder;
}

export async function createdRunFolder(runFolder: string): Promise<void> {
  try {
    await fs.mkdir(dirname(runFolder), { recursive: true, mode: 0o700 });
    await fs.mkdir(runFolder, { mode: 0o700 });
  } catch (error) {
    throw new Refusal(`${NAME} cannot hold the run folder (${errnoCodeOf(error)})`);
  }
  if (realFolderOf(runFolder) !== runFolder)
    throw new Refusal(`${NAME} resolved to another folder after the run folder was created`);
}
