import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

export type Database = BaseSQLiteDatabase<"async", unknown> & Pick<SqliteRemoteDatabase, "batch">;
