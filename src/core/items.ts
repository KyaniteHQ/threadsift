import { and, desc, eq, notExists } from "drizzle-orm";

import { isRefusedHost } from "./addresses.ts";
import type { Fetched } from "./details.ts";
import { fetchLink } from "./fetch-link.ts";
import { enqueueQuietly, hasOpenJob, openingJob } from "./jobs.ts";
import { type Link, isShortLink, parseLink } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { type ItemRow, items } from "./schema.ts";
import { settle } from "./settle.ts";

export type SaveResult =
  | { readonly kind: "saved"; readonly item: ItemRow; readonly created: boolean }
  | { readonly kind: "refused" };

function foundItem(item: ItemRow | undefined, normalizedUrl: string): ItemRow {
  if (item === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return item;
}

async function itemAt(db: Database, normalizedUrl: string): Promise<ItemRow> {
  const [item] = await db.select().from(items).where(eq(items.normalizedUrl, normalizedUrl));

  return foundItem(item, normalizedUrl);
}

async function saveQueued(
  ports: Ports,
  address: string,
  { normalizedUrl, kind, source }: Readonly<Link>,
): Promise<SaveResult> {
  const { db } = ports;
  const now = Date.now();

  const [inserted, , queued, [item]] = await db.batch([
    db
      .insert(items)
      .values({
        source,
        kind,
        normalizedUrl,
        originalUrl: address,
        savedAt: now,
        status: "processing",
      })
      .onConflictDoNothing({ target: items.normalizedUrl })
      .returning({ id: items.id }),
    db
      .update(items)
      .set({ status: "processing", reason: null })
      .where(and(eq(items.normalizedUrl, normalizedUrl), notExists(hasOpenJob("fetch")))),
    openingJob(db, { kind: "fetch", address, normalizedUrl, now }),
    db.select().from(items).where(eq(items.normalizedUrl, normalizedUrl)),
  ]);

  const [job] = queued;

  if (job !== undefined) {
    await enqueueQuietly(ports, [job.id], 0);
  }

  return { kind: "saved", item: foundItem(item, normalizedUrl), created: inserted.length > 0 };
}

async function saveSettled(
  db: Database,
  address: string,
  { normalizedUrl, kind, source }: Readonly<Link>,
  fetched: Readonly<Fetched>,
): Promise<SaveResult> {
  const now = Date.now();

  const [inserted] = await db
    .insert(items)
    .values({
      source,
      kind,
      normalizedUrl,
      originalUrl: address,
      savedAt: now,
      ...settle(fetched, null, now),
    })
    .onConflictDoNothing({ target: items.normalizedUrl })
    .returning();

  if (inserted !== undefined) {
    return { kind: "saved", item: inserted, created: true };
  }

  const known = await itemAt(db, normalizedUrl);

  const [updated] = await db
    .update(items)
    .set(settle(fetched, known.title, now))
    .where(eq(items.id, known.id))
    .returning();

  return { kind: "saved", item: updated ?? known, created: false };
}

async function saveShortLink(ports: Ports, address: string): Promise<SaveResult> {
  const { link, fetched } = await fetchLink(ports.network, address);

  return saveSettled(ports.db, address, link, fetched);
}

export function saveItem(ports: Ports, absoluteUrl: string): Promise<SaveResult> {
  if (isRefusedHost(new URL(absoluteUrl).hostname)) {
    return Promise.resolve({ kind: "refused" });
  }

  return isShortLink(absoluteUrl)
    ? saveShortLink(ports, absoluteUrl)
    : saveQueued(ports, absoluteUrl, parseLink(absoluteUrl));
}

export async function getItem(db: Database, id: number): Promise<ItemRow | undefined> {
  const [item] = await db.select().from(items).where(eq(items.id, id));

  return item;
}

export function listItems(db: Database): Promise<ItemRow[]> {
  return db.select().from(items).orderBy(desc(items.savedAt), desc(items.id));
}
