import { getTableName, is } from "drizzle-orm";
import { SQLiteBaseInteger, SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import { BACKUP_TABLES } from "./backup-tables.ts";
import type { Row } from "./restore-lines.ts";
import { REWRITES, type Rewrite } from "./restore-rewrites.ts";
import * as schema from "./schema.ts";

export type Fallback = string | number | null;

export type Singleton = "keep" | "reset";

export interface ColumnSpec {
  readonly name: string;
  readonly cell: z.ZodType;
}

export interface TableSpec {
  readonly name: string;
  readonly table: SQLiteTable;
  readonly columns: readonly ColumnSpec[];
  readonly fallbacks: Readonly<Record<string, Fallback>>;
  readonly rewrites: Readonly<Record<string, Rewrite>>;
  readonly parents: readonly Readonly<{
    table: string;
    columns: readonly string[];
    parentColumns: readonly string[];
  }>[];
  readonly autoIncrement: boolean;
  readonly singleton: Singleton | null;
}

const STEPS_TABLE = "data_steps";

const SINGLETONS: ReadonlyMap<string, Singleton> = new Map([
  ["log_start", "keep"],
  ["reddit_settings", "reset"],
  ["catalog_version", "reset"],
]);

const Literal = z.union([z.number(), z.string(), z.boolean().transform((flag) => (flag ? 1 : 0))]);

function isJson(text: string): boolean {
  try {
    JSON.parse(text);

    return true;
  } catch {
    return false;
  }
}

const Names = z.array(z.string()).optional();

function valueOf(name: string, columnType: string, values: readonly string[]): z.ZodType {
  switch (columnType) {
    case "SQLiteInteger":
      return z.number().int();
    case "SQLiteBoolean":
      return z.union([z.literal(0), z.literal(1)]);
    case "SQLiteTextJson":
      return z.string().refine((text) => isJson(text));
    case "SQLiteText":
      return values.length === 0 ? z.string() : z.string().refine((text) => values.includes(text));
    default:
      throw new Error(`Column ${name} has the type ${columnType}, which a restore does not read`);
  }
}

function cellOf(
  column: Readonly<{ name: string; columnType: string; notNull: boolean; enumValues: unknown }>,
) {
  const cell = valueOf(column.name, column.columnType, Names.parse(column.enumValues) ?? []);

  return column.notNull ? cell : cell.nullable();
}

function tablesByName(): ReadonlyMap<string, SQLiteTable> {
  const found = new Map<string, SQLiteTable>();

  for (const value of Object.values(schema)) {
    if (is(value, SQLiteTable)) found.set(getTableName(value), value);
  }

  return found;
}

function fallbackOf(
  column: Readonly<{ notNull: boolean; default: unknown }>,
): Fallback | undefined {
  const literal = Literal.safeParse(column.default);

  if (literal.success) return literal.data;

  return column.notNull ? undefined : null;
}

function fallbacksOf(
  name: string,
  columns: readonly Readonly<{ name: string; notNull: boolean; default: unknown }>[],
  exported: readonly string[],
) {
  return Object.fromEntries(
    columns.flatMap((column) => {
      const fallback = fallbackOf(column);

      if (fallback !== undefined) return [[column.name, fallback] as const];

      if (exported.includes(column.name)) return [];

      throw new Error(`${name}.${column.name} is left out of a backup and has no default`);
    }),
  );
}

function specOf(name: string, table: SQLiteTable): TableSpec {
  const { columns, foreignKeys } = getTableConfig(table);
  const exported = Object.entries(BACKUP_TABLES).find(([listed]) => listed === name)?.[1];

  if (exported === undefined) throw new Error(`${name} is not in the backup list`);

  const listed = exported.columns.map((column) => {
    const found = columns.find((held) => held.name === column);

    if (found === undefined) throw new Error(`${name} has no column ${column}`);

    return { name: column, cell: cellOf(found) };
  });

  return {
    name,
    table,
    columns: listed,
    fallbacks: fallbacksOf(name, columns, exported.columns),
    rewrites: REWRITES.get(name) ?? {},
    parents: foreignKeys.map((key) => {
      const reference = key.reference();

      return {
        table: getTableName(reference.foreignTable),
        columns: reference.columns.map((column) => column.name),
        parentColumns: reference.foreignColumns.map((column) => column.name),
      };
    }),
    autoIncrement: columns.some(
      (column) => column.primary && is(column, SQLiteBaseInteger) && column.autoIncrement,
    ),
    singleton: SINGLETONS.get(name) ?? null,
  };
}

function ordered(parents: Readonly<Record<string, readonly string[]>>): readonly string[] {
  const order: string[] = [];

  const visit = (name: string): void => {
    if (order.includes(name)) return;

    for (const parent of parents[name] ?? []) {
      if (Object.hasOwn(parents, parent) && parent !== name) visit(parent);
    }

    order.push(name);
  };

  for (const name of Object.keys(parents)) visit(name);

  return order;
}

function buildRegistry() {
  const held = tablesByName();

  const specs = new Map(
    Object.keys(BACKUP_TABLES).map((name) => {
      const table = held.get(name);

      if (table === undefined) throw new Error(`The schema has no table ${name}`);

      return [name, specOf(name, table)] as const;
    }),
  );

  const parents = Object.fromEntries(
    Array.from(specs, ([name, spec]) => [name, spec.parents.map(({ table }) => table)]),
  );

  return { specs, order: ordered(parents).filter((name) => name !== STEPS_TABLE) };
}

const REGISTRY = buildRegistry();

export const RESTORE_ORDER: readonly string[] = REGISTRY.order;

export const RESTORE_TABLES: readonly string[] = Array.from(REGISTRY.specs.keys());

export function tableSpec(name: string): TableSpec | undefined {
  return REGISTRY.specs.get(name);
}

export type LineVerdict = "valid" | "unknown-column" | "missing-column" | "format";

function columnsVerdict(
  spec: Readonly<TableSpec>,
  row: Readonly<Row>,
  older: boolean,
): LineVerdict {
  const held = new Set(spec.columns.map(({ name }) => name));

  if (!older && Object.keys(row).some((column) => !held.has(column))) return "unknown-column";

  const lacking = spec.columns.filter(({ name }) => !Object.hasOwn(row, name));

  if (lacking.some(({ name }) => !older || !Object.hasOwn(spec.fallbacks, name)))
    return "missing-column";

  return "valid";
}

export function lineVerdict(
  spec: Readonly<TableSpec>,
  row: Readonly<Row>,
  older: boolean,
): LineVerdict {
  const verdict = columnsVerdict(spec, row, older);

  if (verdict !== "valid") return verdict;

  return spec.columns.every(
    ({ name, cell }) => !Object.hasOwn(row, name) || cell.safeParse(row[name]).success,
  )
    ? "valid"
    : "format";
}
