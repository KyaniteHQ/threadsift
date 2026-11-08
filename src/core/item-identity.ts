import { asc, gt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { parseLink } from "./links.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";

export const ITEM_IDENTITY_VERSION = 1;

const PAGE_ROWS = 5000;
const RENAMES_PER_STATEMENT = 100;

interface StoredIdentity {
  readonly id: number;
  readonly kind: string;
  readonly normalizedUrl: string;
}

interface Rename {
  readonly id: number;
  readonly old: string;
  readonly next: string;
}

async function storedIdentities(
  db: Database,
  after = 0,
  found: readonly StoredIdentity[] = [],
): Promise<readonly StoredIdentity[]> {
  const page = await db
    .select({ id: items.id, kind: items.kind, normalizedUrl: items.normalizedUrl })
    .from(items)
    .where(gt(items.id, after))
    .orderBy(asc(items.id))
    .limit(PAGE_ROWS);

  const all = [...found, ...page];
  const last = page.at(-1);

  return page.length < PAGE_ROWS || last === undefined ? all : storedIdentities(db, last.id, all);
}

function proposedIdentity({ kind, normalizedUrl }: Readonly<StoredIdentity>): string {
  if (!URL.canParse(normalizedUrl)) {
    return normalizedUrl;
  }

  const link = parseLink(normalizedUrl);

  return link.kind === kind ? link.normalizedUrl : normalizedUrl;
}

function groupedByProposal(
  stored: readonly StoredIdentity[],
): ReadonlyMap<string, StoredIdentity[]> {
  const groups = new Map<string, StoredIdentity[]>();

  for (const item of stored) {
    const proposed = proposedIdentity(item);
    const group = groups.get(proposed);

    if (group === undefined) {
      groups.set(proposed, [item]);
    } else {
      group.push(item);
    }
  }

  return groups;
}

function renameStatement(db: Database, renames: readonly Rename[]) {
  const json = JSON.stringify(renames);

  const next = sql`(select json_extract(value, '$.next') from json_each(${json}) where json_extract(value, '$.id') = ${items.id} and json_extract(value, '$.old') = ${items.normalizedUrl})`;

  return db
    .update(items)
    .set({ normalizedUrl: sql`coalesce(${next}, ${items.normalizedUrl})` })
    .where(sql`${items.id} in (select json_extract(value, '$.id') from json_each(${json}))`);
}

function report(
  event: string,
  fields: Readonly<Record<string, number | string | readonly number[]>>,
) {
  console.warn(JSON.stringify({ event, ...fields }));
}

export async function planItemIdentity(db: Database): Promise<BatchItem<"sqlite">[][]> {
  const stored = await storedIdentities(db);
  const renames: Rename[] = [];

  for (const [proposed, group] of groupedByProposal(stored)) {
    const [only] = group;

    if (group.length > 1) {
      report("item-identity-collision", {
        identity: proposed,
        itemIds: group.map(({ id }) => id),
      });
    } else if (only !== undefined && only.normalizedUrl !== proposed) {
      renames.push({ id: only.id, old: only.normalizedUrl, next: proposed });
    }
  }

  report("item-identity-planned", { renamed: renames.length, items: stored.length });

  const batches: BatchItem<"sqlite">[][] = [];

  for (let from = 0; from < renames.length; from += RENAMES_PER_STATEMENT) {
    batches.push([renameStatement(db, renames.slice(from, from + RENAMES_PER_STATEMENT))]);
  }

  return batches;
}
