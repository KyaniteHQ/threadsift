import { type SQL, type SQLWrapper, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./database.ts";
import type { Digest } from "./digest-schema.ts";
import { guards, holdsNoRow, insertGuard, unlessRefused } from "./guards.ts";
import { LISTED_COLUMNS, type ListedItemRow, selectItems } from "./item-selection.ts";
import { enqueueRows, openingJob } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Ports } from "./ports.ts";
import { items } from "./schema.ts";
import { queueVaultItems } from "./vault-queue.ts";

export type Existing = "refresh" | "keep";

export interface Saved {
  readonly kind: "saved";
  readonly item: ListedItemRow;
  readonly created: boolean;
}

export interface Paste {
  readonly originalUrl: string;
  readonly address: string;
  readonly digest: Digest | undefined;
  readonly addedByToken: number | null;
}

export function foundItem(item: ListedItemRow | undefined, normalizedUrl: string): ListedItemRow {
  if (item === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return item;
}

export function itemRead(db: Database, at: SQL) {
  return selectItems(db, LISTED_COLUMNS).where(at);
}

export async function itemFound(
  db: Database,
  normalizedUrl: string,
): Promise<ListedItemRow | undefined> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(
    eq(items.normalizedUrl, normalizedUrl),
  );

  return item;
}

export async function itemAt(db: Database, normalizedUrl: string): Promise<ListedItemRow> {
  return foundItem(await itemFound(db, normalizedUrl), normalizedUrl);
}

export function holdsNoItem(db: Database, normalizedUrl: string) {
  return holdsNoRow(db, items, eq(items.normalizedUrl, normalizedUrl));
}

export function queuedRows(
  db: Database,
  { originalUrl, address, digest, addedByToken }: Readonly<Paste>,
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
        addedByToken,
      })
      .onConflictDoNothing({ target: items.normalizedUrl })
      .returning({ id: items.id }),
    db
      .update(items)
      .set({ reason: null, pendingDigest })
      .where(eq(items.normalizedUrl, normalizedUrl)),
    openingJob(db, { kind: "fetch", address, normalizedUrl, now, page }),
    selectItems(db, LISTED_COLUMNS).where(eq(items.normalizedUrl, normalizedUrl)),
    queueVaultItems(db, eq(items.normalizedUrl, normalizedUrl)),
  ] as const;
}

type Statements = readonly BatchItem<"sqlite">[];

export interface Around {
  readonly guard: Readonly<SQLWrapper>;
  readonly before: readonly [] | readonly [BatchItem<"sqlite">];
  readonly after: Statements;
}

type RowResults = readonly [
  readonly Readonly<{ id: number }>[],
  unknown,
  readonly Readonly<{ id: number }>[],
  readonly Readonly<ListedItemRow>[],
  ...unknown[],
];

function settled([inserted, , opened, [item]]: RowResults) {
  return { created: inserted.length > 0, opened, item };
}

async function written(
  db: Database,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  around: Readonly<Around> | undefined,
) {
  const rows = queuedRows(db, paste, link);

  if (around === undefined) return settled(await db.batch(rows));

  const { guard, before, after } = around;
  const checked = insertGuard(db, guard);

  if (before.length === 0) {
    const [, ...results] = await db.batch([checked, ...rows, ...after, db.delete(guards)]);

    return settled(results);
  }

  const [promote] = before;
  const [, , ...results] = await db.batch([checked, promote, ...rows, ...after, db.delete(guards)]);

  return settled(results);
}

export function writeQueued(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  around?: Readonly<Around>,
): Promise<Saved | null> {
  const { db } = ports;

  const write = async (): Promise<Saved> => {
    const { created, opened, item } = await written(db, paste, link, around);

    await enqueueRows(ports, opened);

    return { kind: "saved", item: foundItem(item, link.normalizedUrl), created };
  };

  return around === undefined ? write() : unlessRefused(db, around.guard, write);
}
