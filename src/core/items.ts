import { and, eq, notExists } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { LISTED_COLUMNS, type ListedItemRow, selectItems } from "./item-selection.ts";
import { hasOpenJob, openingJob, enqueueRows } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { items } from "./schema.ts";

export type SaveResult =
  | { readonly kind: "saved"; readonly item: ListedItemRow; readonly created: boolean }
  | { readonly kind: "refused" };

export function foundItem(item: ListedItemRow | undefined, normalizedUrl: string): ListedItemRow {
  if (item === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return item;
}

export async function itemAt(db: Database, normalizedUrl: string): Promise<ListedItemRow> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(
    eq(items.normalizedUrl, normalizedUrl),
  );

  return foundItem(item, normalizedUrl);
}

export interface Paste {
  readonly originalUrl: string;
  readonly address: string;
  readonly digest: Digest | undefined;
}

export function queuedWrites(
  db: Database,
  { originalUrl, address, digest }: Readonly<Paste>,
  { normalizedUrl, kind, source }: Readonly<Link>,
) {
  const now = Date.now();
  const pendingDigest = digest === undefined ? null : JSON.stringify(digest);

  return [
    db
      .insert(items)
      .values({
        source,
        kind,
        normalizedUrl,
        originalUrl,
        savedAt: now,
        status: "processing",
      })
      .onConflictDoNothing({ target: items.normalizedUrl })
      .returning({ id: items.id }),
    db
      .update(items)
      .set({ status: "processing", reason: null })
      .where(and(eq(items.normalizedUrl, normalizedUrl), notExists(hasOpenJob("fetch")))),
    db.update(items).set({ pendingDigest }).where(eq(items.normalizedUrl, normalizedUrl)),
    openingJob(db, { kind: "fetch", address, normalizedUrl, now }),
    selectItems(db, LISTED_COLUMNS).where(eq(items.normalizedUrl, normalizedUrl)),
  ] as const;
}

export async function saveQueued(ports: Ports, paste: Readonly<Paste>, link: Readonly<Link>) {
  const [inserted, , , queued, [item]] = await ports.db.batch(queuedWrites(ports.db, paste, link));

  await enqueueRows(ports, queued);

  return {
    kind: "saved",
    item: foundItem(item, link.normalizedUrl),
    created: inserted.length > 0,
  } as const;
}
