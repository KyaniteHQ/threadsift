import { and, desc, eq, getTableColumns, exists, notExists, sql } from "drizzle-orm";

import { isRefusedHost } from "./addresses.ts";
import type { Fetched } from "./details.ts";
import { resolveShortLink } from "./fetch-link.ts";
import {
  hasOpenJob,
  openingJob,
  openingDigest,
  setDigestFailure,
  enqueueRows,
} from "./job-rows.ts";
import { DIGEST_OUTCOMES } from "./kinds.ts";
import { type Link, isShortLink, parseLink } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { digests, items } from "./schema.ts";
import { settle } from "./settle.ts";

export type ListedItemRow = Awaited<ReturnType<typeof listItems>>[number];

export type SaveResult =
  | { readonly kind: "saved"; readonly item: ListedItemRow; readonly created: boolean }
  | { readonly kind: "refused" };

const {
  generation: _generation,
  digestFailed: _digestFailed,
  ...DETAIL_COLUMNS
} = getTableColumns(items);

const { postText: _postText, postedAt: _postedAt, ...LISTED_COLUMNS } = DETAIL_COLUMNS;

const DIGEST_VIEW_COLUMNS = {
  digestTitle: sql<string | null>`${digests.title}`.as("digest_title"),
  digestTopic: sql<string | null>`${digests.topic}`.as("digest_topic"),
  digestOutcome: sql<
    (typeof DIGEST_OUTCOMES)[number]
  >`case when exists ${hasOpenJob("digest")} then 'pending' when ${items.digestFailed} then 'failed' else 'none' end`.as(
    "digest_outcome",
  ),
};

function selectItems<Fields extends typeof LISTED_COLUMNS>(db: Database, fields: Fields) {
  return db
    .select({ ...fields, ...DIGEST_VIEW_COLUMNS })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id));
}

function foundItem(item: ListedItemRow | undefined, normalizedUrl: string): ListedItemRow {
  if (item === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return item;
}

async function itemAt(db: Database, normalizedUrl: string): Promise<ListedItemRow> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(
    eq(items.normalizedUrl, normalizedUrl),
  );

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
    selectItems(db, LISTED_COLUMNS).where(eq(items.normalizedUrl, normalizedUrl)),
  ]);

  await enqueueRows(ports, queued);

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
    .returning(LISTED_COLUMNS);

  if (inserted !== undefined) {
    return {
      kind: "saved",
      item: { ...inserted, digestTitle: null, digestTopic: null, digestOutcome: "none" },
      created: true,
    };
  }

  const known = await itemAt(db, normalizedUrl);

  const [, [item]] = await db.batch([
    db
      .update(items)
      .set(settle(fetched, known.title, now))
      .where(and(eq(items.id, known.id), notExists(hasOpenJob()))),
    selectItems(db, LISTED_COLUMNS).where(eq(items.id, known.id)),
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

export async function getItem(db: Database, id: number) {
  const [item] = await selectItems(db, DETAIL_COLUMNS).where(eq(items.id, id));

  return item;
}

export async function getListedItem(db: Database, id: number): Promise<ListedItemRow | undefined> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(eq(items.id, id));

  return item;
}

export function listItems(db: Database) {
  return selectItems(db, LISTED_COLUMNS).orderBy(desc(items.savedAt), desc(items.id));
}

export async function retryDigest(ports: Ports, id: number): Promise<ListedItemRow | undefined> {
  const [known] = await ports.db
    .select({
      originalUrl: items.originalUrl,
      normalizedUrl: items.normalizedUrl,
      status: items.status,
    })
    .from(items)
    .where(eq(items.id, id));

  if (known === undefined) return undefined;

  if (known.status === "failed") return getListedItem(ports.db, id);

  const [queued, , , [item]] = await ports.db.batch([
    openingDigest(ports.db, { itemId: id, address: known.originalUrl, now: Date.now() }),
    setDigestFailure(ports.db, id, false),
    ports.db
      .update(items)
      .set({ status: "processing", reason: null })
      .where(and(eq(items.id, id), exists(hasOpenJob("digest")))),
    selectItems(ports.db, LISTED_COLUMNS).where(eq(items.normalizedUrl, known.normalizedUrl)),
  ]);

  await enqueueRows(ports, queued);

  return item;
}
