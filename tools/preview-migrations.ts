import { readdirSync } from "node:fs";

import { z } from "zod";

const Rows = z
  .array(z.object({ results: z.array(z.object({ name: z.string() })) }))
  .transform((statements) => statements.flatMap((statement) => statement.results));

export function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

export function rowNames(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
  query: string,
): readonly string[] {
  const output = run(["d1", "execute", "DB", "--json", "--command", query, ...scope]);

  return Rows.parse(JSON.parse(output)).map((row) => row.name);
}

export function hasTable(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
  table: "d1_migrations" | "pins" | "proposals",
): boolean {
  return (
    rowNames(
      run,
      scope,
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`,
    ).length > 0
  );
}

export function hasForeignMigrations(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
  migrationsDir: string,
): boolean {
  if (!hasTable(run, scope, "d1_migrations")) return false;

  const known = new Set(readdirSync(migrationsDir));

  return rowNames(run, scope, "SELECT name FROM d1_migrations").some((name) => !known.has(name));
}
