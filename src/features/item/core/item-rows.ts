import { type SQLWrapper, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Digest } from "../../../core/contract/digest-schema.ts";
import type { Link } from "../../../core/contract/links.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { holdsNoRow } from "../../../core/kernel/guards.ts";
import { closeItemJobs } from "../../../core/kernel/job-close.ts";
import { enqueueRows, openingJob } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { heldBatch } from "../../../core/kernel/restore-hold.ts";
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
  return [
    dailyBudgetGuard(db, { addedByToken, normalizedUrl, savedAt }),
    db
      .insert(items)
      .values({ source, kind, normalizedUrl, originalUrl, savedAt, addedByToken, ...fetched })
      .onConflictDoNothing({ target: items.normalizedUrl })
      .returning({ id: items.id }),
  ] as const;
}

type InsertResults<Rest extends readonly unknown[]> = readonly [
  budget: unknown,
  inserted: readonly Readonly<{ id: number }>[],
  ...rest: Rest,
];

export function insertResults<Rest extends readonly unknown[]>([
  ,
  inserted,
  ...rest
]: InsertResults<Rest>) {
  return { inserted, rest };
}

export async function guardedItemWrite(
  db: Database,
  condition: Readonly<SQLWrapper>,
  insert: readonly [BatchItem<"sqlite">, BatchItem<"sqlite">],
  rest: readonly BatchItem<"sqlite">[],
) {
  const written = await heldBatch(db, [...insert, ...rest] as const, condition);

  return written === null ? null : insertResults(written).inserted;
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
    insert: itemInsert(db, { link, originalUrl, savedAt: now, addedByToken }),
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

type QueuedResults = readonly [
  reopened: unknown,
  opened: readonly Readonly<{ id: number }>[],
  read: readonly Readonly<ListedItemRow>[],
  ...rest: unknown[],
];

async function writtenFrom(
  ports: Ports,
  link: Readonly<Link>,
  written: InsertResults<QueuedResults> | null,
): Promise<Saved | null> {
  if (written === null) return null;

  const {
    inserted,
    rest: [, opened, [item]],
  } = insertResults(written);

  await enqueueRows(ports, opened);

  return { kind: "saved", item: foundItem(item, link.normalizedUrl), created: inserted.length > 0 };
}

export async function writeQueued(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  around?: Readonly<Around>,
): Promise<Saved | null> {
  const { db } = ports;
  const { insert, rest } = queuedRows(db, paste, link);

  if (around === undefined) {
    return writtenFrom(ports, link, await heldBatch(db, [...insert, ...rest] as const));
  }

  const { guard, before = [], after } = around;

  if (before.length === 0) {
    return writtenFrom(
      ports,
      link,
      await heldBatch(db, [...insert, ...rest, ...after] as const, guard),
    );
  }

  const written = await heldBatch(db, [...before, ...insert, ...rest, ...after] as const, guard);

  if (written === null) return writtenFrom(ports, link, null);

  const [, , , , ...results] = written;

  return writtenFrom(ports, link, results);
}
