import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

export type Database = BaseSQLiteDatabase<"async", unknown>;

export interface Ports {
  readonly db: Database;
}
