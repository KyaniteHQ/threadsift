import { and, eq, notExists } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import type { Fetched } from "./details.ts";
import { resolveShortLink } from "./fetch-link.ts";
import {
  EMPTY_DIGEST_VIEW,
  LISTED_COLUMNS,
  type ListedItemRow,
  selectItems,
} from "./item-selection.ts";
import { hasOpenJob, openingJob, enqueueRows } from "./job-rows.ts";
import { type Link, isRefusedLink, isShortLink, parseLink } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { items } from "./schema.ts";
import { settle } from "./settle.ts";

export type SaveResult =
  | { readonly kind: "saved"; readonly item: ListedItemRow; readonly created: boolean }
  | { readonly kind: "refused" };

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
  readonly digest: Digest | undefined;
}

async function saveQueued(
  ports: Ports,
  { originalUrl, address, digest }: Readonly<Paste>,
  { normalizedUrl, kind, source }: Readonly<Link>,
): Promise<SaveResult> {
  const { db } = ports;
  const now = Date.now();
  const pendingDigest = digest === undefined ? null : JSON.stringify(digest);

  const [inserted, , , queued, [item]] = await db.batch([
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
      item: { ...inserted, ...EMPTY_DIGEST_VIEW },
      created: true,
    };
  }

  const known = await itemAt(db, normalizedUrl);

  const [, , [item]] = await db.batch([
    db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(eq(items.id, known.id), notExists(hasOpenJob("digest")))),
    db
      .update(items)
      .set(settle(fetched, known.title, now))
      .where(and(eq(items.id, known.id), notExists(hasOpenJob()))),
    selectItems(db, LISTED_COLUMNS).where(eq(items.id, known.id)),
  ]);

  return { kind: "saved", item: foundItem(item, normalizedUrl), created: false };
}

async function saveShortLink(ports: Ports, pasted: string, digest?: Digest): Promise<SaveResult> {
  const resolution = await resolveShortLink(ports.network, pasted);

  if (resolution.kind === "failed") {
    return saveSettled(ports.db, pasted, parseLink(pasted), resolution.fetched);
  }

  const { address } = resolution;

  return saveQueued(ports, { originalUrl: pasted, address, digest }, parseLink(address));
}

export function saveItem(ports: Ports, absoluteUrl: string, digest?: Digest): Promise<SaveResult> {
  if (isRefusedLink(absoluteUrl)) {
    return Promise.resolve({ kind: "refused" });
  }

  return isShortLink(absoluteUrl)
    ? saveShortLink(ports, absoluteUrl, digest)
    : saveQueued(
        ports,
        { originalUrl: absoluteUrl, address: absoluteUrl, digest },
        parseLink(absoluteUrl),
      );
}
