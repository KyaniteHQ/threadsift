import { sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { isSweptKey } from "./file-keys.ts";
import { IMAGE_MAX_BYTES, ITEM_REQUEST_BYTES } from "./limits.ts";
import { NAMED_FILES } from "./named-files.ts";
import { RESTORE_FILE_BYTES, RESTORE_FILE_ENTRIES } from "./restore-contract.ts";
import { LOCAL_HEADER_ROOM, type ZipDirectory, type ZipEntry } from "./zip-read.ts";

export interface Named {
  readonly owner: number;
  readonly key: string;
}

export interface Batch {
  readonly stored: readonly ZipEntry[];
  readonly missing: number;
  readonly last: Named;
}

export function namedAfter(db: Database, after: Readonly<Named>) {
  return db
    .select({ key: sql<string>`named.key`, owner: sql<number>`named.owner` })
    .from(sql`${NAMED_FILES} as named`)
    .where(sql`(named.owner, named.key) > (${after.owner}, ${after.key})`)
    .orderBy(sql`named.owner, named.key`)
    .limit(RESTORE_FILE_ENTRIES);
}

function restorable(
  directory: Readonly<ZipDirectory>,
  entries: Readonly<ReadonlyMap<string, Readonly<ZipEntry>>>,
  { owner, key }: Readonly<Named>,
): ZipEntry | null {
  const entry = entries.get(`${directory.root}/${key}`);

  if (entry === undefined || !isSweptKey(key) || !key.startsWith(`items/${String(owner)}/`)) {
    return null;
  }

  const cap = key.includes("/img-") ? IMAGE_MAX_BYTES : ITEM_REQUEST_BYTES;

  return entry.size > cap ? null : entry;
}

export function windowOf(
  directory: Readonly<ZipDirectory>,
  rows: readonly Readonly<Named>[],
): Batch | null {
  const entries = new Map(directory.entries.map((entry) => [entry.name, entry]));
  const stored: ZipEntry[] = [];
  let missing = 0;
  let last: Named | null = null;
  let low = Number.POSITIVE_INFINITY;
  let high = 0;

  for (const row of rows) {
    const entry = restorable(directory, entries, row);

    if (entry === null) {
      missing += 1;
    } else {
      const next = {
        low: Math.min(low, entry.headerOffset),
        high: Math.max(high, entry.headerOffset + LOCAL_HEADER_ROOM + entry.size),
      };

      if (stored.length > 0 && next.high - next.low > RESTORE_FILE_BYTES) break;

      stored.push(entry);
      low = next.low;
      high = next.high;
    }

    last = row;
  }

  return last === null ? null : { stored, missing, last };
}
