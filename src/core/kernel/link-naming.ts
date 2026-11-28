import { type SQL, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { type Link, needsResolving, parseLink } from "../contract/links.ts";
import type { Database } from "./database.ts";
import { itemAliases, items } from "./schema.ts";

export type Naming =
  | { readonly kind: "alias"; readonly shortLink: string }
  | { readonly kind: "identity"; readonly normalizedUrl: string };

export interface AliasedItem extends Link {
  readonly id: number;
  readonly address: string;
}

const held = alias(items, "held");

export function namingOf(absoluteUrl: string): Naming {
  const { normalizedUrl } = parseLink(absoluteUrl);

  return needsResolving(absoluteUrl)
    ? { kind: "alias", shortLink: normalizedUrl }
    : { kind: "identity", normalizedUrl };
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

export function namedItem(naming: Readonly<Naming>): SQL {
  if (naming.kind === "identity") return eq(items.normalizedUrl, naming.normalizedUrl);

  const aliased = sql`(select ${itemAliases.itemId} from ${itemAliases} where ${itemAliases.normalizedUrl} = ${naming.shortLink})`;
  const holder = sql`(select ${held.id} from ${items} as ${held} where ${held.normalizedUrl} = ${naming.shortLink})`;

  return sql`${items.id} = coalesce(${aliased}, ${holder})`;
}
