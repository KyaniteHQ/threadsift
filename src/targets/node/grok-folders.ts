import { mkdir, readFile, readdir, rmdir, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";

import { type ChildFolders, inChildFolders } from "./cli-process.ts";
import { type ToolList, localToolNames } from "./grok-surface.ts";

const CHILD_TEMP_FOLDER = "/tmp";

export interface RunFolders extends ChildFolders {
  readonly grokHome: string;
  readonly promptFile: string;
}

export interface BinaryIdentity {
  readonly path: string;
  readonly size: number;
  readonly modifiedMs: number;
}

export function inRunFolders<Result>(work: (folders: RunFolders) => Promise<Result>) {
  return inChildFolders(async (folders) => {
    const grokFolders = {
      ...folders,
      grokHome: join(folders.root, "grok"),
      promptFile: join(folders.root, "prompt.txt"),
    };

    await mkdir(grokFolders.grokHome);

    return work(grokFolders);
  });
}

export async function identityOf(path: string): Promise<BinaryIdentity | null> {
  try {
    const { size, mtimeMs } = await stat(path);

    return { path, size, modifiedMs: mtimeMs };
  } catch {
    return null;
  }
}

async function sessionFolders(grokHome: string): Promise<readonly string[]> {
  const sessions = join(grokHome, "sessions");
  const projects = await readdir(sessions).catch(() => []);

  const folders = await Promise.all(
    projects.map(async (project) =>
      (await readdir(join(sessions, project)).catch(() => []))
        .filter((name) => !name.includes("."))
        .map((name) => join(sessions, project, name)),
    ),
  );

  return folders.flat();
}

export async function toolListOf(grokHome: string): Promise<ToolList> {
  const folders = await sessionFolders(grokHome);

  if (folders.length === 0) return { kind: "absent" };

  const lists = await Promise.all(
    folders.map(async (folder) =>
      localToolNames(await readFile(join(folder, "tool_definitions.json"), "utf8").catch(() => "")),
    ),
  );

  const names = lists.flatMap((list) => list ?? []);

  return lists.every((list) => list !== null)
    ? { kind: "listed", names: names.toSorted() }
    : { kind: "unreadable" };
}

export async function sweepGrokTemp({ grokHome, root }: RunFolders): Promise<void> {
  const ids = (await sessionFolders(grokHome)).map((folder) => basename(folder));

  await Promise.all(
    ids.map((id) => rmdir(join(CHILD_TEMP_FOLDER, "sessions", id)).catch(() => null)),
  );

  const lockFolder = join(CHILD_TEMP_FOLDER, `grok-file-lock-${String(process.getuid?.() ?? 0)}`);

  const slots = (await readdir(lockFolder).catch(() => [])).filter((name) =>
    name.endsWith(".slot"),
  );

  await Promise.all(
    slots.map(async (name) => {
      const file = join(lockFolder, name);

      if ((await readFile(file, "utf8").catch(() => "")).includes(root)) {
        await unlink(file).catch(() => null);
      }
    }),
  );
}
