import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const BUSY_TIMEOUT_MS = 5000;

export interface OlderRelease {
  readonly instance: Instance;
  sqlite(): DatabaseSync;
  startAgain(): void;
  close(): Promise<void>;
}

export async function startOlderRelease(migration: string, seed: string): Promise<OlderRelease> {
  const older = await mkdtemp(join(tmpdir(), "threadsift-older-release-"));

  await Promise.all(
    (await readdir(MIGRATIONS))
      .filter((name) => name.endsWith(".sql") && name < migration)
      .map((name) => cp(join(MIGRATIONS, name), join(older, name))),
  );

  const instance = await Instance.start({
    prepare: (file) => {
      openDatabase(file, older).close();

      const made = new DatabaseSync(file);

      made.exec(seed);
      made.close();
    },
  });

  await instance.setUp();

  return {
    instance,
    sqlite: () => {
      const database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
      database.exec("PRAGMA foreign_keys = ON");

      return database;
    },
    startAgain: () => {
      openDatabase(instance.databaseFile, MIGRATIONS).close();
    },
    close: async () => {
      await instance.close();
      await rm(older, { recursive: true });
    },
  };
}
