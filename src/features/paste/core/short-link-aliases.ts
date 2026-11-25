import {
  type SQLWrapper,
  and,
  eq,
  exists,
  isNotNull,
  isNull,
  ne,
  not,
  notExists,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { spellingOf } from "../../../core/contract/link-place.ts";
import { type Link, parseLink } from "../../../core/contract/links.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { holdsNoRow } from "../../../core/kernel/guards.ts";
import { closeItemJobs } from "../../../core/kernel/job-close.ts";
import { itemAliases, items } from "../../../core/kernel/schema.ts";

const holder = alias(items, "holder");
const rival = alias(itemAliases, "rival");

export interface AliasedItem extends Link {
  readonly id: number;
  readonly address: string;
}

export interface ShortLinkAlias {
  readonly shortLink: string;
  readonly stale: Readonly<AliasedItem> | undefined;
}

export async function aliasedItem(
  db: Database,
  shortLink: string,
): Promise<AliasedItem | undefined> {
  const [found] = await db
    .select({
      id: items.id,
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

export function itemAddress({ address, normalizedUrl }: Readonly<AliasedItem>): string {
  return spellingOf({ normalizedUrl, originalUrl: address });
}

function isObserved(
  { address, itemId }: Readonly<Record<"address" | "itemId", Readonly<SQLWrapper>>>,
  stale: Readonly<AliasedItem> | undefined,
) {
  return stale === undefined
    ? sql`0`
    : sql`(${address} = ${stale.address} and ${itemId} = ${stale.id})`;
}

export function holdsAlias(db: Database, shortLink: string, known: Readonly<AliasedItem>) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(itemAliases)
      .innerJoin(items, eq(items.id, itemAliases.itemId))
      .where(
        and(
          eq(itemAliases.normalizedUrl, shortLink),
          isObserved(itemAliases, known),
          eq(items.normalizedUrl, known.normalizedUrl),
        ),
      ),
  );
}

export function holdsNoRival(
  db: Database,
  { shortLink, stale }: Readonly<ShortLinkAlias>,
  { normalizedUrl }: Readonly<Link>,
) {
  const holds = db
    .select({ one: sql`1` })
    .from(holder)
    .where(and(eq(holder.id, rival.itemId), eq(holder.normalizedUrl, normalizedUrl)));

  return notExists(
    db
      .select({ one: sql`1` })
      .from(rival)
      .where(
        and(eq(rival.normalizedUrl, shortLink), not(isObserved(rival, stale)), notExists(holds)),
      ),
  );
}

function failedResolutionAt({ shortLink, stale }: Readonly<ShortLinkAlias>) {
  const heldAt =
    stale === undefined
      ? eq(items.normalizedUrl, shortLink)
      : sql`${eq(items.id, stale.id)} and ${eq(items.normalizedUrl, parseLink(stale.address).normalizedUrl)}`;

  return sql`(${heldAt}) and ${isNotNull(items.fetch)} and ${ne(items.fetch, "ok")} and ${isNull(items.fetchedAt)}`;
}

export function holdsNoFailedItem(db: Database, short: Readonly<ShortLinkAlias>) {
  return holdsNoRow(db, items, failedResolutionAt(short));
}

export function promotableFailedItem(
  db: Database,
  short: Readonly<ShortLinkAlias>,
  normalizedUrl: string,
) {
  const taken = db
    .select({ one: sql`1` })
    .from(holder)
    .where(eq(holder.normalizedUrl, normalizedUrl));

  return sql`${failedResolutionAt(short)} and ${notExists(taken)}`;
}

export function promoteFailedItem(
  db: Database,
  short: Readonly<ShortLinkAlias>,
  { normalizedUrl, kind, source }: Readonly<Link>,
) {
  return db
    .update(items)
    .set({ normalizedUrl, kind, source })
    .where(promotableFailedItem(db, short, normalizedUrl));
}

export function promotionClosingJobs(
  db: Database,
  short: Readonly<ShortLinkAlias>,
  link: Readonly<Link>,
) {
  const promotable = promotableFailedItem(db, short, link.normalizedUrl);
  const promotableId = sql`(select ${items.id} from ${items} where ${promotable})`;

  return [...closeItemJobs(db, promotableId), promoteFailedItem(db, short, link)] as const;
}

export function recordAlias(
  db: Database,
  { shortLink, stale }: Readonly<ShortLinkAlias>,
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
    .onConflictDoUpdate({
      target: itemAliases.normalizedUrl,
      set: { address: sql`excluded.address`, itemId: sql`excluded.item_id` },
      setWhere: isObserved(itemAliases, stale),
    });
}
