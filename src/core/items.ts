import { and, desc, eq, getTableColumns, isNotNull, notExists, sql } from "drizzle-orm";

import { isRefusedHost } from "./addresses.ts";
import type { Fetched } from "./details.ts";
import { resolveShortLink } from "./fetch-link.ts";
import { hasOpenJob, openingJob } from "./job-rows.ts";
import { enqueueQuietly } from "./jobs.ts";
import { type Link, isShortLink, parseLink } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { type ItemRow, items } from "./schema.ts";
import { settle } from "./settle.ts";

export type ListedItemRow = Omit<ItemRow, "postText" | "postedAt"> & {
  readonly digestTitle: string | null;
  readonly digestTopic: string | null;
};

export type SaveResult =
  | { readonly kind: "saved"; readonly item: ListedItemRow; readonly created: boolean }
  | { readonly kind: "refused" };

const { postText: _postText, postedAt: _postedAt, ...columns } = getTableColumns(items);

const DIGEST_COLUMNS = {
  digestTitle: sql<
    string | null
  >`(select json_extract(digest, '$.title') from digests where item_id = ${items.id})`,
  digestTopic: sql<
    string | null
  >`(select json_extract(digest, '$.topic') from digests where item_id = ${items.id})`,
};

const LISTED_COLUMNS = { ...columns, ...DIGEST_COLUMNS };

function foundItem(item: ListedItemRow | undefined, normalizedUrl: string): ListedItemRow {
  if (item === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return item;
}

async function itemAt(db: Database, normalizedUrl: string): Promise<ListedItemRow> {
  const [item] = await db
    .select(LISTED_COLUMNS)
    .from(items)
    .where(eq(items.normalizedUrl, normalizedUrl));

  return foundItem(item, normalizedUrl);
}

interface Paste {
  readonly originalUrl: string;
  readonly address: string;
}

async function saveQueued(
  ports: Ports,
  { originalUrl, address }: Readonly<Paste>,
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
    openingJob(db, { kind: "fetch", address, normalizedUrl, now }),
    db.select(LISTED_COLUMNS).from(items).where(eq(items.normalizedUrl, normalizedUrl)),
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
    .returning(columns);

  if (inserted !== undefined) {
    return { kind: "saved", item: await itemAt(db, normalizedUrl), created: true };
  }

  const known = await itemAt(db, normalizedUrl);

  const [, [item]] = await db.batch([
    db
      .update(items)
      .set(settle(fetched, known.title, now))
      .where(
        and(
          eq(items.id, known.id),
          notExists(hasOpenJob("fetch")),
          notExists(hasOpenJob("digest")),
        ),
      ),
    db.select(LISTED_COLUMNS).from(items).where(eq(items.id, known.id)),
  ]);

  return { kind: "saved", item: foundItem(item, normalizedUrl), created: false };
}

async function saveShortLink(ports: Ports, pasted: string): Promise<SaveResult> {
  const resolution = await resolveShortLink(ports.network, pasted);

  if (resolution.kind === "failed") {
    return saveSettled(ports.db, pasted, parseLink(pasted), resolution.fetched);
  }

  const { address } = resolution;

  return saveQueued(ports, { originalUrl: pasted, address }, parseLink(address));
}

export function saveItem(ports: Ports, absoluteUrl: string): Promise<SaveResult> {
  if (isRefusedHost(new URL(absoluteUrl).hostname)) {
    return Promise.resolve({ kind: "refused" });
  }

  return isShortLink(absoluteUrl)
    ? saveShortLink(ports, absoluteUrl)
    : saveQueued(ports, { originalUrl: absoluteUrl, address: absoluteUrl }, parseLink(absoluteUrl));
}

export async function getItem(
  db: Database,
  id: number,
): Promise<
  | (ItemRow & { readonly digestTitle: string | null; readonly digestTopic: string | null })
  | undefined
> {
  const [item] = await db
    .select({ ...getTableColumns(items), ...DIGEST_COLUMNS })
    .from(items)
    .where(eq(items.id, id));

  return item;
}

export async function getListedItem(db: Database, id: number): Promise<ListedItemRow | undefined> {
  const [item] = await db.select(LISTED_COLUMNS).from(items).where(eq(items.id, id));

  return item;
}

export function listItems(db: Database): Promise<ListedItemRow[]> {
  return db.select(LISTED_COLUMNS).from(items).orderBy(desc(items.savedAt), desc(items.id));
}

export async function retryDigest(ports: Ports, id: number): Promise<ListedItemRow | undefined> {
  const item = await getItem(ports.db, id);

  if (item === undefined || item.postText === null) return getListedItem(ports.db, id);

  const [, queued] = await ports.db.batch([
    ports.db
      .update(items)
      .set({ status: "processing", reason: null, digestOutcome: "pending" })
      .where(and(eq(items.id, id), isNotNull(items.postText), notExists(hasOpenJob("digest")))),
    openingJob(ports.db, {
      kind: "digest",
      address: item.originalUrl,
      normalizedUrl: item.normalizedUrl,
      now: Date.now(),
    }),
  ]);

  await enqueueQuietly(
    ports,
    queued.map(({ id: jobId }) => jobId),
    0,
  );

  return getListedItem(ports.db, id);
}
