import { chmod, lstat, mkdir, open, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { configuredCode } from "../shared/configured-code.ts";
import { hasErrnoCode } from "./errno.ts";

type Entry = "missing" | "empty" | "owned";

interface Reservation {
  readonly path: string;
  readonly create: () => Promise<void>;
  readonly holds: (path: string) => Promise<boolean>;
}

async function emptyDirectory(path: string): Promise<boolean> {
  const found = await lstat(path);

  return found.isDirectory() && (await readdir(path)).length === 0;
}

async function emptyFile(path: string): Promise<boolean> {
  const found = await lstat(path);

  return found.isFile() && found.size === 0;
}

function directoryReservation(home: string, name: string): Reservation {
  const path = join(home, name);

  return {
    path,
    create: () => mkdir(path),
    holds: emptyDirectory,
  };
}

function fileReservation(home: string, name: string): Reservation {
  const path = join(home, name);

  return {
    path,
    create: async () => {
      const handle = await open(path, "wx", 0o600);

      await handle.close();
    },
    holds: emptyFile,
  };
}

function reservations(home: string): readonly Reservation[] {
  return [
    directoryReservation(home, "AGENTS.md"),
    directoryReservation(home, "AGENTS.override.md"),
    fileReservation(home, "skills"),
  ];
}

async function inspect({ path, holds }: Readonly<Reservation>): Promise<Entry> {
  try {
    return (await holds(path)) ? "empty" : "owned";
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) return "missing";

    throw error;
  }
}

async function reserve(reservation: Readonly<Reservation>): Promise<boolean> {
  try {
    await reservation.create();

    return true;
  } catch (error) {
    if (!hasErrnoCode(error, "EEXIST")) throw error;

    return (await inspect(reservation)) === "empty";
  }
}

export async function reserveCodexHome(home: string): Promise<string | null> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  await chmod(home, 0o700);

  const wanted = reservations(home);
  const found = await Promise.all(wanted.map((reservation) => inspect(reservation)));
  const owned = wanted.find((_reservation, index) => found[index] === "owned");

  if (owned !== undefined) return owned.path;

  const missing = wanted.filter((_reservation, index) => found[index] === "missing");
  const made = await Promise.all(missing.map((reservation) => reserve(reservation)));

  return missing.find((_reservation, index) => made[index] === false)?.path ?? null;
}

export function codexHomeOf({
  home,
  dataDir,
}: Readonly<{ home: string | undefined; dataDir: string }>): string {
  return resolve(configuredCode(home) ?? join(dataDir, "codex"));
}
