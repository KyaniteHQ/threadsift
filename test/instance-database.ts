import { mkdtempDisposableSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { z } from "zod";

import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

export const openMigrated = (file: string) => openDatabase(file, MIGRATIONS);

export function instanceDatabase(template?: Readonly<Uint8Array>) {
  using cleanup = new DisposableStack();
  const folder = cleanup.use(mkdtempDisposableSync(join(tmpdir(), "threadsift-test-"))).path;
  const file = join(folder, "threadsift.db");

  if (template !== undefined) writeFileSync(file, template);

  const database = openMigrated(file);
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

export type Param = string | number | null;

const CountSchema = z.object({ n: z.number() });

const MigrationSchema = z.object({ name: z.string() });

export function databaseOf(file: string) {
  const exec = (query: string, ...params: readonly Param[]): void => {
    using database = new DatabaseSync(file);

    database.prepare(query).run(...params);
  };

  const script = (statements: string): void => {
    using database = new DatabaseSync(file);

    database.exec(statements);
  };

  const rows = <Schema extends z.ZodType>(
    schema: Schema,
    query: string,
    ...params: readonly Param[]
  ): z.infer<Schema>[] => {
    using database = new DatabaseSync(file, { readOnly: true });

    return database
      .prepare(query)
      .all(...params)
      .map((row) => schema.parse(row));
  };

  const count = (query: string, ...params: readonly Param[]): number => {
    const [row] = rows(CountSchema, query, ...params);
    if (row === undefined) throw new Error("The count query returned no row");

    return row.n;
  };

  return {
    exec,
    script,
    rows,
    count,
    rowCount: (table: string, where = "1 = 1", ...params: readonly Param[]): number =>
      count(`select count(*) as n from ${table} where ${where}`, ...params),
    catalogVersion: (): number => count("select version as n from catalog_version where id = 1"),
    latestMigration: (): string | undefined =>
      rows(MigrationSchema, "select max(name) as name from d1_migrations")[0]?.name,
  };
}
