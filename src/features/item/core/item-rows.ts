import { type SQLWrapper, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Digest } from "../../../core/contract/digest-schema.ts";
import type { Link } from "../../../core/contract/links.ts";
import type { Database } from "../../../core/kernel/database.ts";
import {
  guardedWrite,
  guards,
  holdsNoRow,
  insertGuard,
  unlessRefused,
} from "../../../core/kernel/guards.ts";
import { enqueueRows, openingJob } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { lostRaceUnlessHeld, restoreGuard } from "../../../core/kernel/restore-hold.ts";
import { items } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { type ListedItemRow, itemRead, itemWhere } from "./item-selection.ts";
import { type Settled, reopenedFetch } from "./settle.ts";

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

export function itemInsert(
  db: Database,
  {
    link: { source, kind, normalizedUrl },
    originalUrl,
    savedAt,
    addedByToken,
    fetched,
  }: Readonly<{
    link: Readonly<Link>;
    originalUrl: string;
    savedAt: number;
    addedByToken: number | null;
    fetched?: Readonly<Settled> | undefined;
  }>,
) {
  return [
    restoreGuard(db),
    db
      .insert(items)
      .values({ source, kind, normalizedUrl, originalUrl, savedAt, addedByToken, ...fetched })
      .onConflictDoNothing({ target: items.normalizedUrl })
      .returning({ id: items.id }),
  ] as const;
}

export function guardedItemWrite<Insert extends BatchItem<"sqlite">>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  [open, insert, ...rest]: readonly [BatchItem<"sqlite">, Insert, ...BatchItem<"sqlite">[]],
) {
  return lostRaceUnlessHeld(db, () => guardedWrite(db, condition, insert, [open, ...rest]));
}

export async function itemAt(db: Database, normalizedUrl: string): Promise<ListedItemRow> {
  return foundItem(await itemWhere(db, eq(items.normalizedUrl, normalizedUrl)), normalizedUrl);
}

export function holdsNoItem(db: Database, normalizedUrl: string) {
  return holdsNoRow(db, items, eq(items.normalizedUrl, normalizedUrl));
}

export function queuedRows(
  db: Database,
  { originalUrl, address, digest, addedByToken }: Readonly<Paste>,
  link: Readonly<Link>,
  page?: string,
) {
  const { normalizedUrl } = link;
  const now = Date.now();
  const pendingDigest = digest === undefined ? null : JSON.stringify(digest);

  return [
    ...itemInsert(db, { link, originalUrl, savedAt: now, addedByToken }),
    reopenedFetch(db, eq(items.normalizedUrl, normalizedUrl), pendingDigest),
    openingJob(db, { kind: "fetch", address, normalizedUrl, now, page }),
    itemRead(db, eq(items.normalizedUrl, normalizedUrl)),
    ...STALE.itemChanged(db, eq(items.normalizedUrl, normalizedUrl)),
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

  if (around === undefined) {
    const [, ...results] = await db.batch([...rows, db.delete(guards)]);

    return settled(results);
  }

  const { guard, before, after } = around;
  const checked = insertGuard(db, guard);

  if (before.length === 0) {
    const [, , ...results] = await db.batch([checked, ...rows, ...after, db.delete(guards)]);

    return settled(results);
  }

  const [promote] = before;
  const [, , , ...results] = await db.batch([
    checked,
    promote,
    ...rows,
    ...after,
    db.delete(guards),
  ]);

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

  return around === undefined
    ? write()
    : lostRaceUnlessHeld(db, () => unlessRefused(db, around.guard, write));
}
