import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { Instance } from "./instance.ts";

type Param = string | number | null;

export function exec(instance: Instance, query: string, ...params: readonly Param[]) {
  using database = new DatabaseSync(instance.databaseFile);

  database.prepare(query).run(...params);
}

export function script(instance: Instance, statements: string): void {
  using database = new DatabaseSync(instance.databaseFile);

  database.exec(statements);
}

export function rows<Schema extends z.ZodType>(
  instance: Instance,
  schema: Schema,
  query: string,
  ...params: readonly Param[]
): z.infer<Schema>[] {
  using database = new DatabaseSync(instance.databaseFile);

  return database
    .prepare(query)
    .all(...params)
    .map((row) => schema.parse(row));
}

const CountSchema = z.object({ n: z.number() });

export function count(instance: Instance, query: string, ...params: readonly Param[]) {
  const [row] = rows(instance, CountSchema, query, ...params);
  if (row === undefined) throw new Error("The count query returned no row");

  return row.n;
}

const CatalogVersionSchema = z.object({ version: z.number() });

export const catalogVersion = (instance: Instance): number =>
  CatalogVersionSchema.parse(
    rows(instance, CatalogVersionSchema, "select version from catalog_version where id = 1")[0],
  ).version;

export async function nextSweep(instance: Instance): Promise<void> {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
}
