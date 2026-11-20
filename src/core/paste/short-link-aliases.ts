import { and, eq, isNotNull, isNull, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Link } from "../contract/links.ts";
import type { Database } from "../kernel/database.ts";
import { holdsNoRow } from "../kernel/guards.ts";
import { itemAliases, items } from "../kernel/schema.ts";

const holder = alias(items, "holder");
const rival = alias(itemAliases, "rival");

interface AliasedItem extends Link {
  readonly address: string;
}

export async function aliasedItem(
  db: Database,
  shortLink: string,
): Promise<AliasedItem | undefined> {
  const [found] = await db
    .select({
      normalizedUrl: items.normalizedUrl,
      kind: items.kind,
      source: items.source,
      address: itemAliases.address,
    })
    .from(itemAliases)
    .innerJoin(items, eq(items.id, itemAliases.itemId))
    .where(eq(itemAliases.normalizedUrl, shortLink));

  return found;
}

export function holdsNoRival(db: Database, shortLink: string, { normalizedUrl }: Readonly<Link>) {
  const holds = db
    .select({ one: sql`1` })
    .from(holder)
    .where(and(eq(holder.id, rival.itemId), eq(holder.normalizedUrl, normalizedUrl)));

  return notExists(
    db
      .select({ one: sql`1` })
      .from(rival)
      .where(and(eq(rival.normalizedUrl, shortLink), notExists(holds))),
  );
}

function failedResolutionAt(shortLink: string) {
  return sql`${eq(items.normalizedUrl, shortLink)} and ${isNotNull(items.fetch)} and ${ne(items.fetch, "ok")} and ${isNull(items.fetchedAt)}`;
}

export function holdsNoFailedItem(db: Database, shortLink: string) {
  return holdsNoRow(db, items, failedResolutionAt(shortLink));
}

export function promotableFailedItem(db: Database, shortLink: string, normalizedUrl: string) {
  const taken = db
    .select({ one: sql`1` })
    .from(holder)
    .where(eq(holder.normalizedUrl, normalizedUrl));

  return sql`${failedResolutionAt(shortLink)} and ${notExists(taken)}`;
}

export function promoteFailedItem(
  db: Database,
  shortLink: string,
  { normalizedUrl, kind, source }: Readonly<Link>,
) {
  return db
    .update(items)
    .set({ normalizedUrl, kind, source })
    .where(promotableFailedItem(db, shortLink, normalizedUrl));
}

export function recordAlias(
  db: Database,
  shortLink: string,
  address: string,
  { normalizedUrl }: Readonly<Link>,
) {
  return db
    .insert(itemAliases)
    .select(
      db
        .select({
          normalizedUrl: sql<string>`${shortLink}`.as("normalized_url"),
          address: sql<string>`${address}`.as("address"),
          itemId: items.id,
        })
        .from(items)
        .where(eq(items.normalizedUrl, normalizedUrl)),
    )
    .onConflictDoNothing();
}
