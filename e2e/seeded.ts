import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { type Instance, launchAt } from "./access.ts";
import { isContainerTarget } from "./target.ts";

const ROOT = join(import.meta.dirname, "..");

export interface Seed {
  readonly files: readonly string[];
  readonly sql: string;
}

export function migrationsBefore(prefix: string): readonly string[] {
  return readdirSync(join(ROOT, "migrations"))
    .filter((name) => name.endsWith(".sql") && name < prefix)
    .toSorted();
}

export function wrangler(args: readonly string[]): void {
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: ROOT,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function seedWorkerState(dir: string, seed: Readonly<Seed>): void {
  const migrations = join(dir, "old-migrations");
  const config = join(dir, "old.jsonc");
  const state = join(dir, "state");
  mkdirSync(migrations, { recursive: true });
  mkdirSync(state, { recursive: true });

  for (const file of seed.files) {
    copyFileSync(join(ROOT, "migrations", file), join(migrations, file));
  }

  writeFileSync(
    config,
    JSON.stringify({
      name: "threadsift",
      compatibility_date: "2026-10-23",
      d1_databases: [{ binding: "DB", database_name: "threadsift", migrations_dir: migrations }],
    }),
  );

  const options = ["DB", "--local", "--persist-to", state, "--config", config];
  wrangler(["d1", "migrations", "apply", ...options]);
  const rows = join(dir, "rows.sql");
  writeFileSync(rows, seed.sql);
  wrangler(["d1", "execute", ...options, "--file", rows]);
}

function seedContainerFile(dir: string, seed: Readonly<Seed>): string {
  const folder = join(dir, "seed");
  const file = join(folder, "threadsift.db");
  mkdirSync(folder, { recursive: true });
  const database = new DatabaseSync(file);

  database.exec(`CREATE TABLE d1_migrations(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);

  for (const name of seed.files) {
    database.exec(readFileSync(join(ROOT, "migrations", name), "utf8"));
    database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
  }

  database.exec(seed.sql);
  database.close();

  return file;
}

export function launchSeeded(dir: string, code: string, seed: Readonly<Seed>): Instance {
  if (isContainerTarget())
    return launchAt(dir, code, { THREADSIFT_SEED_DB: seedContainerFile(dir, seed) });

  seedWorkerState(dir, seed);

  return launchAt(dir, code);
}
