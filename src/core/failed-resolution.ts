import { type SQLWrapper, and, eq, notExists } from "drizzle-orm";

import type { Concluded } from "./details.ts";
import { guards, holdsNoRow, insertGuard, unlessRefused } from "./guards.ts";
import { LISTED_COLUMNS, selectItems } from "./item-selection.ts";
import { type Existing, type SaveResult, foundItem, itemAt } from "./items.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Database } from "./ports.ts";
import { itemAliases, items } from "./schema.ts";
import { settledKnown, settledNew } from "./settle.ts";

interface Failure {
  readonly address: string;
  readonly link: Readonly<Link>;
  readonly fetched: Readonly<Concluded>;
  readonly now: number;
  readonly addedByToken: number | null;
}

async function insertedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { address, link: { normalizedUrl, kind, source }, fetched, now, addedByToken }: Readonly<Failure>,
): Promise<SaveResult | undefined> {
  const [, inserted, [item]] = await db.batch([
    insertGuard(db, noAlias),
    db
      .insert(items)
      .values({
        source,
        kind,
        normalizedUrl,
        originalUrl: address,
        savedAt: now,
        addedByToken,
        ...settledNew(fetched, now),
      })
      .onConflictDoNothing({ target: items.normalizedUrl })
      .returning({ id: items.id }),
    selectItems(db, LISTED_COLUMNS).where(eq(items.normalizedUrl, normalizedUrl)),
    db.delete(guards),
  ]);

  return inserted.length === 0
    ? undefined
    : { kind: "saved", item: foundItem(item, normalizedUrl), created: true };
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
      .set(settledKnown(fetched, known.title, now))
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
  fetched: Readonly<Concluded>,
  existing: Existing,
  addedByToken: number | null,
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
