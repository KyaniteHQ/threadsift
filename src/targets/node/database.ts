import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { RemoteCallback } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";

import type { Database } from "../../core/ports.ts";

const SqlParamsSchema = z.array(
  z.union([z.null(), z.number(), z.bigint(), z.string(), z.instanceof(Uint8Array)]),
);

export interface OpenDatabase {
  readonly db: Database;
  close(): void;
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
    sqlite.exec("BEGIN");

    try {
      sqlite.exec(readFileSync(join(migrationsDir, name), "utf8"));
      sqlite.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function proxyTo(sqlite: DatabaseSync): RemoteCallback {
  return (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    statement.setReturnArrays(true);
    const bound = SqlParamsSchema.parse(params);

    if (method === "run") {
      statement.run(...bound);

      return Promise.resolve({ rows: [] });
    }

    if (method === "get") {
      return Promise.reject(new Error("The sqlite-proxy get method is not supported; use all"));
    }

    return Promise.resolve({ rows: statement.all(...bound) });
  };
}

export function openDatabase(file: string, migrationsDir: string): OpenDatabase {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  applyMigrations(sqlite, migrationsDir);

  return {
    db: drizzle(proxyTo(sqlite)),
    close: () => {
      sqlite.close();
    },
  };
}
