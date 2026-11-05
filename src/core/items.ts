import { and, desc, eq, notExists, sql } from "drizzle-orm";

import { isRefusedHost } from "./addresses.ts";
import { fetchLink } from "./fetch-link.ts";
import { FETCH_DEADLINE_MS, hasOpenJob } from "./jobs.ts";
import { type Link, isShortLink, parseLink } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { type ItemRow, items, jobs } from "./schema.ts";
import { settle } from "./settle.ts";

export type SaveResult =
  | { readonly kind: "saved"; readonly item: ItemRow; readonly created: boolean }
  | { readonly kind: "refused" };

async function itemAt(db: Database, normalizedUrl: string): Promise<ItemRow> {
  const [item] = await db.select().from(items).where(eq(items.normalizedUrl, normalizedUrl));

  if (item === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return item;
}

async function enqueueQuietly(ports: Ports, jobId: number): Promise<void> {
  try {
    await ports.jobs.enqueue(jobId, 0);
  } catch (error) {
    console.error(`Job ${jobId} was saved but not queued; the next sweep queues it`, error);
  }
}

function openingJob(db: Database, address: string, normalizedUrl: string, now: number) {
  return db
    .insert(jobs)
    .select(
      db
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<"fetch">`'fetch'`.as("kind"),
          itemId: items.id,
          address: sql<string>`${address}`.as("address"),
          state: sql<"queued">`'queued'`.as("state"),
          attempts: sql<number>`0`.as("attempts"),
          nextAttemptAt: sql<number>`${now}`.as("next_attempt_at"),
          claimExpires: sql<null>`null`.as("claim_expires"),
        })
        .from(items)
        .where(and(eq(items.normalizedUrl, normalizedUrl), notExists(hasOpenJob("fetch")))),
    )
    .onConflictDoNothing()
    .returning({ id: jobs.id });
}

async function saveQueued(
  ports: Ports,
  address: string,
  { normalizedUrl, kind, source }: Readonly<Link>,
): Promise<SaveResult> {
  const { db } = ports;
  const now = Date.now();

  const [inserted, , queued] = await db.batch([
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
    openingJob(db, address, normalizedUrl, now),
  ]);

  const [job] = queued;

  if (job !== undefined) {
    await enqueueQuietly(ports, job.id);
  }

  return { kind: "saved", item: await itemAt(db, normalizedUrl), created: inserted.length > 0 };
}

async function saveSettled(
  db: Database,
  address: string,
  { normalizedUrl, kind, source }: Readonly<Link>,
  fetched: Parameters<typeof settle>[0],
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
  const { link, fetched } = await fetchLink(
    ports.network,
    address,
    AbortSignal.timeout(FETCH_DEADLINE_MS),
  );

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
