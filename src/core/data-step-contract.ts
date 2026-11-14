import type { SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./ports.ts";

export interface Advance {
  readonly writes: readonly BatchItem<"sqlite">[];
  readonly cursor: string | null;
  readonly guard?: SQL;
}

export interface DataStep {
  readonly name: string;
  readonly version: number;
  readonly advance: (db: Database, cursor: string | null) => Promise<Advance>;
}
