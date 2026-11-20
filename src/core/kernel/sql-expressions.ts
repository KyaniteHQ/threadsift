import { type SQLWrapper, sql } from "drizzle-orm";

export const DATABASE_NOW = sql<number>`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;

export function amongJson(column: Readonly<SQLWrapper>, json: string) {
  return sql`${column} in (select value from json_each(${json}))`;
}

export function among(column: Readonly<SQLWrapper>, values: readonly (number | string)[]) {
  return amongJson(column, JSON.stringify(values));
}
