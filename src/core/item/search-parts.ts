import type { SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "../kernel/database.ts";
import {
  commentPartWrites,
  digestPartWrites,
  fetchedPartWrites,
  highlightPartWrites,
  notePartWrites,
  repositoryPartWrites,
} from "./search.ts";

export function rebuiltPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
  { postText, comments }: Readonly<{ postText: string | null; comments: readonly string[] }>,
): readonly BatchItem<"sqlite">[] {
  return [
    ...fetchedPartWrites(db, scope, postText),
    ...digestPartWrites(db, scope),
    ...commentPartWrites(db, scope, comments),
    ...repositoryPartWrites(db, scope),
    ...highlightPartWrites(db, scope),
    ...notePartWrites(db, scope),
  ];
}
