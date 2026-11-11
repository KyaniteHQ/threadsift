import { and, eq, notExists } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { LISTED_COLUMNS, type ListedItemRow, selectItems } from "./item-selection.ts";
import { hasOpenJob, openingJob, enqueueRows } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { guards, holdsNoRow, insertGuard, items } from "./schema.ts";
import { unlessRefused } from "./short-link-aliases.ts";
import type { UNSUPPORTED_PAGE_LINK } from "./supplied-page.ts";

export type SaveResult =
  | { readonly kind: "saved"; readonly item: ListedItemRow; readonly created: boolean }
  | { readonly kind: "refused" };

export type Existing = "refresh" | "keep";

export interface Invalid<Field extends string> {
  readonly kind: "invalid";
  readonly field: Field;
  readonly reason: string;
  readonly code?: typeof UNSUPPORTED_PAGE_LINK;
}

export interface ThreadKept {
  readonly kind: "thread-kept";
}

export interface NotWaiting {
  readonly kind: "not-waiting";
}

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
  page?: string,
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
    openingJob(db, { kind: "fetch", address, normalizedUrl, now, page }),
    selectItems(db, LISTED_COLUMNS).where(eq(items.normalizedUrl, normalizedUrl)),
  ] as const;
}

export function holdsNoItem(db: Database, normalizedUrl: string) {
  return holdsNoRow(db, items, eq(items.normalizedUrl, normalizedUrl));
}

async function saveNewOnly(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
): Promise<SaveResult> {
  const { db } = ports;
  const noItem = holdsNoItem(db, link.normalizedUrl);

  const added = await unlessRefused(db, noItem, async () => {
    const [, , , , queued, [item]] = await db.batch([
      insertGuard(db, noItem),
      ...queuedWrites(db, paste, link),
      db.delete(guards),
    ]);

    await enqueueRows(ports, queued);

    return { kind: "saved", item: foundItem(item, link.normalizedUrl), created: true } as const;
  });

  return added ?? { kind: "saved", item: await itemAt(db, link.normalizedUrl), created: false };
}

export async function saveQueued(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  existing: Existing = "refresh",
) {
  if (existing === "keep") return saveNewOnly(ports, paste, link);

  const [inserted, , , queued, [item]] = await ports.db.batch(queuedWrites(ports.db, paste, link));

  await enqueueRows(ports, queued);

  return {
    kind: "saved",
    item: foundItem(item, link.normalizedUrl),
    created: inserted.length > 0,
  } as const;
}
