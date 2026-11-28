import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

import { openDatabase } from "../src/targets/node/database.ts";
import { migrationLines, rolledBack } from "./migration-compare.ts";

const USAGE =
  "Usage: node tools/migration-dry-run.ts (<database file> | --seed <sql file>) [--migrations <dir>] [--rollback <sql file>]";

class Refused extends Error {}

function copyOf(source: string, target: string): string {
  const sqlite = new DatabaseSync(source, { readOnly: true });

  try {
    sqlite.prepare("vacuum into ?").run(target);
  } finally {
    sqlite.close();
  }

  return target;
}

function seeded(directory: string, migrations: string, seed: string): string {
  const earlier = join(directory, "earlier-migrations");
  const files = readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .toSorted();

  mkdirSync(earlier);

  for (const name of files.slice(0, -1)) copyFileSync(join(migrations, name), join(earlier, name));

  const file = join(directory, "seeded.sqlite");

  openDatabase(file, earlier).close();

  const sqlite = new DatabaseSync(file);

  try {
    sqlite.exec(readFileSync(seed, "utf8"));
  } finally {
    sqlite.close();
  }

  return file;
}

function present(path: string | undefined, what: string): string | undefined {
  if (path === undefined) return undefined;

  const full = resolve(path);

  if (!existsSync(full)) throw new Refused(`the ${what} ${full} does not exist`);

  return full;
}

function dryRun(directory: string): readonly string[] {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      migrations: { type: "string" },
      rollback: { type: "string" },
      seed: { type: "string" },
    },
  });
  const [file, ...extra] = positionals;

  if ((file === undefined) === (values.seed === undefined) || extra.length > 0) {
    throw new Refused("name one database file or one --seed file");
  }

  const migrations =
    present(values.migrations, "migrations folder") ??
    join(import.meta.dirname, "..", "migrations");
  const rollback = present(values.rollback, "rollback file");
  const seed = present(values.seed, "seed file");
  const source =
    seed === undefined ? present(file, "database file") : seeded(directory, migrations, seed);

  if (source === undefined) throw new Refused("name one database file or one --seed file");

  const original = copyOf(source, join(directory, "original.sqlite"));
  const copy = copyOf(source, join(directory, "copy.sqlite"));

  openDatabase(copy, migrations).close();

  return [
    `copy: ${copy} (from ${seed === undefined ? source : `the seed ${seed}`}; the source is read only)`,
    ...migrationLines(copy, original),
    ...(rollback === undefined ? [] : rolledBack(copy, original, rollback)),
  ];
}

const directory = mkdtempSync(join(tmpdir(), "threadsift-migration-dry-run-"));

const removeCopies = () => {
  rmSync(directory, { recursive: true, force: true });
};

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const) {
  process.once(signal, () => {
    removeCopies();
    process.exit(code);
  });
}

try {
  process.stdout.write(`${dryRun(directory).join("\n")}\n`);
} catch (error) {
  if (!(error instanceof Refused)) throw error;

  process.stderr.write(`migration-dry-run: ${error.message}\n${USAGE}\n`);
  process.exitCode = 2;
} finally {
  removeCopies();
}
