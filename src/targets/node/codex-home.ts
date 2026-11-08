import { chmod, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { configuredCode } from "../shared/configured-code.ts";

const DIRECTORY_NAMES = ["AGENTS.md", "AGENTS.override.md"];
const SKILLS_NAME = "skills";
const BUNDLED_SKILLS = ".system";

type Entry = "missing" | "directory" | "file" | "other";

async function entryOf(path: string): Promise<Entry> {
  try {
    const found = await lstat(path);

    if (found.isDirectory()) return "directory";

    return found.isFile() ? "file" : "other";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "missing";

    throw error;
  }
}

async function holdsOnlyBundledSkills(path: string): Promise<boolean> {
  const names = await readdir(path);

  return names.every((name) => name === BUNDLED_SKILLS);
}

async function reserveDirectory(path: string): Promise<boolean> {
  const entry = await entryOf(path);

  if (entry === "missing") await mkdir(path);

  return entry === "missing" || entry === "directory";
}

async function reserveSkills(path: string): Promise<boolean> {
  const entry = await entryOf(path);

  if (entry === "file") return true;

  if (entry === "directory") {
    if (!(await holdsOnlyBundledSkills(path))) return false;

    await rm(path, { recursive: true });
  } else if (entry === "other") return false;

  await writeFile(path, "");

  return true;
}

export async function reserveCodexHome(home: string): Promise<string | null> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  await chmod(home, 0o700);

  const names = [...DIRECTORY_NAMES, SKILLS_NAME];

  const reserved = await Promise.all([
    ...DIRECTORY_NAMES.map((name) => reserveDirectory(join(home, name))),
    reserveSkills(join(home, SKILLS_NAME)),
  ]);

  const refused = names.find((_name, index) => reserved[index] === false);

  return refused === undefined ? null : join(home, refused);
}

export function codexHomeOf({
  home,
  dataDir,
}: Readonly<{ home: string | undefined; dataDir: string }>): string {
  return resolve(configuredCode(home) ?? join(dataDir, "codex"));
}
