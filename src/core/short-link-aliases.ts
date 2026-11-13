import { and, eq, isNotNull, isNull, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Link } from "./links.ts";
import type { Database } from "./ports.ts";
import { itemAliases, items } from "./schema.ts";

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

export function promoteFailedItem(
  db: Database,
  shortLink: string,
  { normalizedUrl, kind, source }: Readonly<Link>,
) {
  const taken = db
    .select({ one: sql`1` })
    .from(holder)
    .where(eq(holder.normalizedUrl, normalizedUrl));

  return db
    .update(items)
    .set({ normalizedUrl, kind, source })
    .where(
      and(
        eq(items.normalizedUrl, shortLink),
        isNotNull(items.fetch),
        ne(items.fetch, "ok"),
        isNull(items.fetchedAt),
        notExists(taken),
      ),
    );
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
