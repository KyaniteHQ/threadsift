import { mkdtempDisposableSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

export function instanceDatabase(template?: Readonly<Uint8Array>) {
  using cleanup = new DisposableStack();
  const folder = cleanup.use(mkdtempDisposableSync(join(tmpdir(), "threadsift-test-"))).path;
  const file = join(folder, "threadsift.db");

  if (template !== undefined) writeFileSync(file, template);

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

export async function snapshotDatabase(file: string): Promise<Uint8Array> {
  const snapshot = join(dirname(file), "owner.db");
  using source = new DatabaseSync(file, { readOnly: true });
  await backup(source, snapshot);

  return readFileSync(snapshot);
}
