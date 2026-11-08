import { type SQLWrapper, and, eq, notExists } from "drizzle-orm";

import type { Concluded } from "./details.ts";
import { EMPTY_JOINED_VIEW, LISTED_COLUMNS, selectItems } from "./item-selection.ts";
import { type SaveResult, foundItem, itemAt } from "./items.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Database } from "./ports.ts";
import { guards, insertGuard, items } from "./schema.ts";
import { settle } from "./settle.ts";
import { holdsNoAlias, unlessAliased } from "./short-link-aliases.ts";

interface Failure {
  readonly address: string;
  readonly link: Readonly<Link>;
  readonly fetched: Readonly<Concluded>;
  readonly now: number;
}

async function insertedFailure(
  db: Database,
  noAlias: Readonly<SQLWrapper>,
  { address, link: { normalizedUrl, kind, source }, fetched, now }: Readonly<Failure>,
): Promise<SaveResult | undefined> {
  const [, [inserted]] = await db.batch([
    insertGuard(db, noAlias),
    db
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
      .returning(LISTED_COLUMNS),
    db.delete(guards),
  ]);

  return inserted === undefined
    ? undefined
    : { kind: "saved", item: { ...inserted, ...EMPTY_JOINED_VIEW }, created: true };
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

export function saveFailedResolution(
  db: Database,
  address: string,
  link: Readonly<Link>,
  fetched: Readonly<Concluded>,
): Promise<SaveResult | null> {
  const noAlias = holdsNoAlias(db, link.normalizedUrl);
  const failure = { address, link, fetched, now: Date.now() };

  return unlessAliased(
    db,
    noAlias,
    async () =>
      (await insertedFailure(db, noAlias, failure)) ?? refreshedFailure(db, noAlias, failure),
  );
}
