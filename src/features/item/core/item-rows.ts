import { type SQLWrapper, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Digest } from "../../../core/contract/digest-schema.ts";
import type { Link } from "../../../core/contract/links.ts";
import type { Database } from "../../../core/kernel/database.ts";
import {
  guardedWrites,
  guards,
  holdsNoRow,
  insertGuard,
  unlessRefused,
} from "../../../core/kernel/guards.ts";
import { closeItemJobs } from "../../../core/kernel/job-close.ts";
import { enqueueRows, openingJob } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { restoreGuard } from "../../../core/kernel/restore-hold.ts";
import { items } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { dailyBudgetGuard } from "../../access/core/agent-token-budget.ts";
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
  return {
    restoreGuard: restoreGuard(db),
    budgetGuard: dailyBudgetGuard(db, { addedByToken, normalizedUrl, savedAt }),
    insert: db
      .insert(items)
      .values({ source, kind, normalizedUrl, originalUrl, savedAt, addedByToken, ...fetched })
      .onConflictDoNothing({ target: items.normalizedUrl })
      .returning({ id: items.id }),
  };
}

export function guardedItemWrite<Insert extends BatchItem<"sqlite">>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  {
    restoreGuard: held,
    budgetGuard,
    insert,
  }: Readonly<{
    restoreGuard: BatchItem<"sqlite">;
    budgetGuard: BatchItem<"sqlite">;
    insert: Insert;
  }>,
  rest: readonly BatchItem<"sqlite">[],
) {
  return unlessRefused(async () => {
    const [, , , inserted] = await db.batch([
      held,
      ...guardedWrites(db, condition, [budgetGuard, insert, ...rest] as const),
    ] as const);

    return inserted;
  });
}

export async function itemAt(db: Database, normalizedUrl: string): Promise<ListedItemRow> {
  return foundItem(await itemWhere(db, eq(items.normalizedUrl, normalizedUrl)), normalizedUrl);
}

export async function knownItem(db: Database, normalizedUrl: string): Promise<Saved | null> {
  const item = await itemWhere(db, eq(items.normalizedUrl, normalizedUrl));

  return item === undefined ? null : { kind: "saved", item, created: false };
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

  return {
    ...itemInsert(db, { link, originalUrl, savedAt: now, addedByToken }),
    rest: [
      reopenedFetch(db, eq(items.normalizedUrl, normalizedUrl), pendingDigest),
      openingJob(db, { kind: "fetch", address, normalizedUrl, now, page }),
      itemRead(db, eq(items.normalizedUrl, normalizedUrl)),
      ...STALE.itemChanged(db, eq(items.normalizedUrl, normalizedUrl)),
    ] as const,
  };
}

type Statements = readonly BatchItem<"sqlite">[];

type AsBatchItems<Tuple extends readonly unknown[]> = {
  readonly [Index in keyof Tuple]: BatchItem<"sqlite">;
};

type Promotion = readonly [...AsBatchItems<ReturnType<typeof closeItemJobs>>, BatchItem<"sqlite">];

export interface Around {
  readonly guard: Readonly<SQLWrapper>;
  readonly before?: readonly [] | Promotion;
  readonly after: Statements;
}

type RowResults = readonly [
  readonly Readonly<{ id: number }>[],
  unknown,
  readonly Readonly<{ id: number }>[],
  readonly Readonly<ListedItemRow>[],
  ...unknown[],
];

function writtenFrom(
  ports: Ports,
  link: Readonly<Link>,
  batch: () => Promise<RowResults>,
): Promise<Saved | null> {
  const write = async (): Promise<Saved> => {
    const [inserted, , opened, [item]] = await batch();

    await enqueueRows(ports, opened);

    return {
      kind: "saved",
      item: foundItem(item, link.normalizedUrl),
      created: inserted.length > 0,
    };
  };

  return unlessRefused(write);
}

function writtenBare(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
): Promise<Saved | null> {
  const { restoreGuard: held, budgetGuard, insert, rest } = queuedRows(ports.db, paste, link);

  return writtenFrom(ports, link, async () => {
    const [, , ...results] = await ports.db.batch([
      held,
      budgetGuard,
      insert,
      ...rest,
      ports.db.delete(guards),
    ]);

    return results;
  });
}

export function writeQueued(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  around?: Readonly<Around>,
): Promise<Saved | null> {
  const { db } = ports;
  if (around === undefined) return writtenBare(ports, paste, link);

  const { restoreGuard: held, budgetGuard, insert, rest } = queuedRows(db, paste, link);

  const { guard, before = [], after } = around;
  const checked = insertGuard(db, guard);

  if (before.length === 0) {
    return writtenFrom(ports, link, async () => {
      const [, , , ...results] = await db.batch([
        held,
        checked,
        budgetGuard,
        insert,
        ...rest,
        ...after,
        db.delete(guards),
      ]);

      return results;
    });
  }

  return writtenFrom(ports, link, async () => {
    const [, , , , , , , ...results] = await db.batch([
      held,
      checked,
      ...before,
      budgetGuard,
      insert,
      ...rest,
      ...after,
      db.delete(guards),
    ]);

    return results;
  });
}
