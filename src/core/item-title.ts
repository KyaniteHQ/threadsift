import { sql } from "drizzle-orm";

import { digests, items } from "./schema.ts";

export function itemTitle() {
  return sql<string | null>`coalesce(${digests.title}, ${items.title})`;
}
