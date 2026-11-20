import type { Database } from "./database.ts";
import type { Link } from "./links.ts";
import { items } from "./schema.ts";

export interface ThreadPlace extends Link {
  readonly address: string;
  readonly addedByToken: number | null;
}

export function threadItemInsert(db: Database, place: Readonly<ThreadPlace>) {
  return db
    .insert(items)
    .values({
      source: place.source,
      kind: place.kind,
      normalizedUrl: place.normalizedUrl,
      originalUrl: place.address,
      savedAt: Date.now(),
      addedByToken: place.addedByToken,
    })
    .onConflictDoNothing({ target: items.normalizedUrl })
    .returning({ id: items.id });
}
