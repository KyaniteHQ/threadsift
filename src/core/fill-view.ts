import { sql } from "drizzle-orm";

import { noThreadFor } from "./reddit-thread.ts";
import { items } from "./schema.ts";

export const FILL_VIEW_COLUMNS = {
  fillable:
    sql<boolean>`(${items.kind} in ('reddit-post', 'reddit-comment') and ${noThreadFor(items.id)})`
      .mapWith(Boolean)
      .as("fillable"),
};
