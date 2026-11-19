import { type SQLWrapper, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Digest } from "./ai-contract.ts";
import type { Database } from "./database.ts";
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

interface Written {
  readonly created: boolean;
  readonly opened: readonly Readonly<{ id: number }>[];
  readonly item: ListedItemRow | undefined;
}

type Statements = readonly BatchItem<"sqlite">[];

type Frame =
  | { readonly kind: "open" }
  | {
      readonly kind: "guarded";
      readonly guard: Readonly<SQLWrapper>;
      readonly after: Statements;
    }
  | {
      readonly kind: "promoting";
      readonly guard: Readonly<SQLWrapper>;
      readonly promote: BatchItem<"sqlite">;
      readonly alias: BatchItem<"sqlite">;
    };

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

async function written(
  db: Database,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  frame: Readonly<Frame>,
): Promise<Written> {
  const rows = queuedRows(db, paste, link);

  switch (frame.kind) {
    case "open": {
      const [inserted, , opened, [item]] = await db.batch(rows);

      return { created: inserted.length > 0, opened, item };
    }

    case "guarded": {
      const [, inserted, , opened, [item]] = await db.batch([
        insertGuard(db, frame.guard),
        ...rows,
        ...frame.after,
        db.delete(guards),
      ]);

      return { created: inserted.length > 0, opened, item };
    }

    case "promoting": {
      const [, , inserted, , opened, [item]] = await db.batch([
        insertGuard(db, frame.guard),
        frame.promote,
        ...rows,
        frame.alias,
        db.delete(guards),
      ]);

      return { created: inserted.length > 0, opened, item };
    }

    default: {
      const exhaustive: never = frame;

      return exhaustive;
    }
  }
}

export function writeQueued(
  ports: Ports,
  paste: Readonly<Paste>,
  link: Readonly<Link>,
  frame: Readonly<Frame>,
): Promise<Saved | null> {
  const { db } = ports;

  const write = async (): Promise<Saved> => {
    const { created, opened, item } = await written(db, paste, link, frame);

    await enqueueRows(ports, opened);

    return { kind: "saved", item: foundItem(item, link.normalizedUrl), created };
  };

  return frame.kind === "open" ? write() : unlessRefused(db, frame.guard, write);
}
