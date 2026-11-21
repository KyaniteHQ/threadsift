import { copyFileSync, mkdtempDisposableSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

export function instanceDatabase(template?: string) {
  using cleanup = new DisposableStack();
  const folder = cleanup.use(mkdtempDisposableSync(join(tmpdir(), "threadsift-test-"))).path;
  const file = join(folder, "threadsift.db");

  if (template !== undefined) copyFileSync(template, file);

  const database = openDatabase(file, MIGRATIONS);
  cleanup.defer(() => {
    database.close();
  });
  const resources = cleanup.move();

  return {
    db: database.db,
    file,
    dataDir: join(folder, "data"),
    [Symbol.dispose]: () => {
      resources.dispose();
    },
  };
}

export async function snapshotDatabase(file: string): Promise<string> {
  const directory = mkdtempDisposableSync(join(tmpdir(), "threadsift-owner-"));
  process.once("exit", () => {
    directory.remove();
  });
  const snapshot = join(directory.path, "threadsift.db");
  using source = new DatabaseSync(file, { readOnly: true });
  await backup(source, snapshot);

  return snapshot;
}
