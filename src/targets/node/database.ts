import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { AsyncBatchRemoteCallback, RemoteCallback } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";

import type { Database } from "../../core/ports.ts";

const SqlParamsSchema = z.array(
  z.union([z.null(), z.number(), z.bigint(), z.string(), z.instanceof(Uint8Array)]),
);

interface OpenDatabase {
  readonly db: Database;
  close(): void;
}

function inTransaction<T>(sqlite: DatabaseSync, work: () => T): T {
  sqlite.exec("BEGIN");

  try {
    const result = work();
    sqlite.exec("COMMIT");

    return result;
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

function applyMigrations(sqlite: DatabaseSync, migrationsDir: string): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS d1_migrations(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);

  const applied = new Set(
    sqlite
      .prepare("SELECT name FROM d1_migrations")
      .all()
      .map((row) => row["name"]),
  );

  const pending = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && !applied.has(name))
    .toSorted();

  for (const name of pending) {
    inTransaction(sqlite, () => {
      sqlite.exec(readFileSync(join(migrationsDir, name), "utf8"));
      sqlite.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
    });
  }
}

interface RemoteQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly method: "run" | "all" | "values" | "get";
}

function execute(sqlite: DatabaseSync, { sql, params, method }: Readonly<RemoteQuery>) {
  const statement = sqlite.prepare(sql);
  statement.setReturnArrays(true);
  const bound = SqlParamsSchema.parse(params);

  if (method === "run") {
    statement.run(...bound);

    return { rows: [] };
  }

  if (method === "get") {
    throw new Error("The sqlite-proxy get method is not supported; use all");
  }

  return { rows: statement.all(...bound) };
}

function promised<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

function proxyTo(sqlite: DatabaseSync): RemoteCallback {
  return (sql, params, method) => promised(() => execute(sqlite, { sql, params, method }));
}

function batchTo(sqlite: DatabaseSync): AsyncBatchRemoteCallback {
  return (queries) =>
    promised(() => inTransaction(sqlite, () => queries.map((query) => execute(sqlite, query))));
}

const BUSY_TIMEOUT_MS = 5000;

export function openDatabase(file: string, migrationsDir: string): OpenDatabase {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file, { timeout: BUSY_TIMEOUT_MS });
  applyMigrations(sqlite, migrationsDir);

  return {
    db: drizzle(proxyTo(sqlite), batchTo(sqlite)),
    close: () => {
      sqlite.close();
    },
  };
}
