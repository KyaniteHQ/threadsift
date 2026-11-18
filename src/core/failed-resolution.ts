import { type SQLWrapper, and, eq, notExists } from "drizzle-orm";

import type { Concluded } from "./details.ts";
import { guards, holdsNoRow, insertGuard, unlessRefused } from "./guards.ts";
import { LISTED_COLUMNS, selectItems } from "./item-selection.ts";
import {
  type Existing,
  type Paste,
  type SaveResult,
  foundItem,
  holdsNoItem,
  itemAt,
} from "./items.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Database } from "./ports.ts";
import { itemAliases, items } from "./schema.ts";
import { settle } from "./settle.ts";
import { queueVaultItems } from "./vault-queue.ts";

type FailedFetch = Exclude<Concluded, { status: "ok" }>;

interface Failure {
  readonly address: string;
  readonly link: Readonly<Link>;
  readonly fetched: Readonly<FailedFetch>;
  readonly now: number;
  readonly addedByToken: Paste["addedByToken"];
}

function insertedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { address, link: { normalizedUrl, kind, source }, fetched, now, addedByToken }: Readonly<Failure>,
): Promise<SaveResult | null> {
  const missing = holdsNoItem(db, normalizedUrl);
  const itemKey = eq(items.normalizedUrl, normalizedUrl);

  return unlessRefused(db, missing, async () => {
    const [, , , [item]] = await db.batch([
      insertGuard(db, noAlias),
      insertGuard(db, missing),
      db.insert(items).values({
        source,
        kind,
        normalizedUrl,
        originalUrl: address,
        savedAt: now,
        addedByToken,
        ...settle(fetched, null, now),
      }),
      selectItems(db, LISTED_COLUMNS).where(itemKey),
      queueVaultItems(db, itemKey),
      db.delete(guards),
    ]);

    return { kind: "saved", item: foundItem(item, normalizedUrl), created: true };
  });
}

async function refreshedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { link: { normalizedUrl }, fetched, now }: Readonly<Failure>,
): Promise<SaveResult> {
  const known = await itemAt(db, normalizedUrl);

  const [, , , [item]] = await db.batch([
    insertGuard(db, noAlias),
    db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(eq(items.id, known.id), notExists(hasOpenJob("digest")))),
    db
      .update(items)
      .set(settle(fetched, known.title, now))
      .where(and(eq(items.id, known.id), notExists(hasOpenJob()))),
    selectItems(db, LISTED_COLUMNS).where(eq(items.id, known.id)),
    db.delete(guards),
  ]);

  return { kind: "saved", item: foundItem(item, normalizedUrl), created: false };
}

async function keptFailure(db: Database, { normalizedUrl }: Readonly<Link>): Promise<SaveResult> {
  return { kind: "saved", item: await itemAt(db, normalizedUrl), created: false };
}

export function saveFailedResolution(
  db: Database,
  address: string,
  link: Readonly<Link>,
  fetched: Readonly<FailedFetch>,
  existing: Existing,
  addedByToken: Paste["addedByToken"],
): Promise<SaveResult | null> {
  const noAlias = holdsNoRow(db, itemAliases, eq(itemAliases.normalizedUrl, link.normalizedUrl));
  const failure = { address, link, fetched, now: Date.now(), addedByToken };

  return unlessRefused(
    db,
    noAlias,
    async () =>
      (await insertedFailure(db, noAlias, failure)) ??
      (existing === "keep" ? keptFailure(db, link) : refreshedFailure(db, noAlias, failure)),
  );
}
