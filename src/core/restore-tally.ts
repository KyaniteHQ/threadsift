import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

export function tallied(column: Readonly<SQLWrapper>, name: string, delta: SQL | number): SQL {
  const path = sql.raw(`'$."${name}"'`);

  return sql`json_set(${column}, ${path}, coalesce(json_extract(${column}, ${path}), 0) + ${delta})`;
}
