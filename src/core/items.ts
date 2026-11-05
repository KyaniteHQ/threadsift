import { desc, eq } from "drizzle-orm";

import { isRefusedHost } from "./addresses.ts";
import type { Fetched } from "./details.ts";
import { fetchLink } from "./fetch-link.ts";
import type { FetchResult } from "./fetch-results.ts";
import type { Link } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { type ItemRow, items } from "./schema.ts";

export type SaveResult =
  | {
      readonly kind: "saved";
      readonly item: ItemRow;
      readonly created: boolean;
      readonly fetch: FetchResult;
    }
  | { readonly kind: "refused" };

async function store(
  db: Database,
  originalUrl: string,
  { normalizedUrl, kind, source }: Readonly<Link>,
  fetched: Readonly<Fetched>,
) {
  const found = fetched.status === "ok" ? fetched.found : null;
  const now = Date.now();
  const details = found === null ? null : { ...found, fetchedAt: now };

  const [inserted] = await db
    .insert(items)
    .values({ source, kind, normalizedUrl, originalUrl, savedAt: now, ...details })
    .onConflictDoNothing({ target: items.normalizedUrl })
    .returning();

  if (inserted !== undefined) {
    return { item: inserted, created: true };
  }

  const known = db.select().from(items).where(eq(items.normalizedUrl, normalizedUrl));

  const [existing] =
    details === null
      ? await known
      : await db
          .update(items)
          .set(details)
          .where(eq(items.normalizedUrl, normalizedUrl))
          .returning();

  if (existing === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return { item: existing, created: false };
}

export async function saveItem(ports: Ports, absoluteUrl: string): Promise<SaveResult> {
  if (isRefusedHost(new URL(absoluteUrl).hostname)) {
    return { kind: "refused" };
  }

  const { link, fetched } = await fetchLink(ports.network, absoluteUrl);
  const { item, created } = await store(ports.db, absoluteUrl, link, fetched);

  return { kind: "saved", item, created, fetch: fetched.status };
}

export function listItems(db: Database): Promise<ItemRow[]> {
  return db.select().from(items).orderBy(desc(items.savedAt), desc(items.id));
}
