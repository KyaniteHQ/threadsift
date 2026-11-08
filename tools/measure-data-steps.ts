import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";

import { wrangler } from "../e2e/seeded.ts";
import { migrateData } from "../src/core/data-steps.ts";

interface Statement {
  readonly bind: (...values: readonly unknown[]) => Statement;
  readonly run: () => Promise<object | null>;
  readonly all: () => Promise<object | null>;
  readonly first: (column?: string) => Promise<object | null>;
  readonly raw: (options?: Readonly<{ columnNames?: boolean }>) => Promise<object | null>;
}

interface D1 {
  readonly prepare: (sql: string) => Statement;
  readonly batch: (statements: readonly Statement[]) => Promise<object | null>;
}

const root = resolve(import.meta.dirname, "..");

const IDENTITY_ITEMS = 60_000;
const NAME_PAIRS = 3000;
const RUNS = 6;

const seed = `
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${IDENTITY_ITEMS})
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at)
SELECT i, 'github', 'github-repo', 'https://github.com/Org/Repo-' || i, 'https://github.com/Org/Repo-' || i, 5000 + i FROM n;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${NAME_PAIRS})
INSERT INTO topics (id, key, name)
SELECT 2 * i - 1, 'straße ' || i, 'Straße ' || i FROM n
UNION ALL SELECT 2 * i, 'strasse ' || i, 'STRASSE ' || i FROM n;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${NAME_PAIRS})
INSERT INTO tags (id, key, name)
SELECT 2 * i - 1, 'straße ' || i, 'Straße ' || i FROM n
UNION ALL SELECT 2 * i, 'strasse ' || i, 'STRASSE ' || i FROM n;
`;

const dir = mkdtempSync(join(tmpdir(), "measure-data-steps-"));
const state = join(dir, "state");
const config = join(dir, "measure.jsonc");

mkdirSync(state);

writeFileSync(
  config,
  JSON.stringify({
    name: "threadsift",
    compatibility_date: "2026-10-23",
    d1_databases: [
      {
        binding: "DB",
        database_name: "threadsift",
        migrations_dir: join(root, "migrations"),
      },
    ],
  }),
);

const options = ["DB", "--local", "--persist-to", state, "--config", config];

wrangler(["d1", "migrations", "apply", ...options]);

writeFileSync(join(dir, "seed.sql"), seed);

wrangler(["d1", "execute", ...options, "--file", join(dir, "seed.sql")]);

const proxy = await getPlatformProxy<{ DB: D1 }>({
  configPath: config,
  persist: { path: join(state, "v3") },
});

let queries = 0;

const inner = new WeakMap<Statement, Statement>();

function counted(statement: Statement): Statement {
  const wrapper: Statement = {
    bind: (...values) => counted(statement.bind(...values)),
    run: () => {
      queries += 1;

      return statement.run();
    },
    all: () => {
      queries += 1;

      return statement.all();
    },
    first: (column) => {
      queries += 1;

      return statement.first(column);
    },
    raw: (columns) => {
      queries += 1;

      return statement.raw(columns);
    },
  };

  inner.set(wrapper, statement);

  return wrapper;
}

const binding = proxy.env.DB;

const counting: D1 = {
  prepare: (sql) => counted(binding.prepare(sql)),
  batch: (statements) => {
    queries += 1;

    return binding.batch(statements.map((statement) => inner.get(statement) ?? statement));
  },
};

const db = drizzle(counting);

for (let run = 1; run <= RUNS; run += 1) {
  queries = 0;
  const started = Date.now();
  // oxlint-disable-next-line eslint/no-await-in-loop -- each run continues from the cursors the previous run stored.
  await migrateData(db);
  console.log(JSON.stringify({ run, queries, milliseconds: Date.now() - started }));
}

await proxy.dispose();
