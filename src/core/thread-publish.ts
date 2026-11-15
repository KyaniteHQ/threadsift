import { eq, sql } from "drizzle-orm";

import type { Counting } from "./caller.ts";
import { digestAfterFetch } from "./digest-job.ts";
import { closeItemJobs } from "./job-close.ts";
import type { Link } from "./links.ts";
import type { Database } from "./ports.ts";
import { ownerOf, threadWrites } from "./reddit-thread.ts";
import { items, media } from "./schema.ts";
import { fetchedPartWrites } from "./search.ts";
import type { StoredThread } from "./stored-thread.ts";

export interface ThreadPlace extends Link {
  readonly address: string;
  readonly counting: Counting;
}

export function threadItemInsert(db: Database, place: Readonly<ThreadPlace>) {
  return db
    .insert(items)
    .values({
      source: place.source,
      kind: place.kind,
      normalizedUrl: place.normalizedUrl,
      originalUrl: place.address,
      savedAt: Date.now(),
      ...place.counting,
    })
    .onConflictDoNothing({ target: items.normalizedUrl })
    .returning({ id: items.id });
}

function contentWrites(
  db: Database,
  { normalizedUrl }: Readonly<ThreadPlace>,
  thread: Readonly<StoredThread>,
  pendingDigest: string | null,
) {
  const owner = ownerOf(normalizedUrl);

  return [
    ...closeItemJobs(db, owner.id),
    db.delete(media).where(eq(media.itemId, owner.id)),
    db
      .update(items)
      .set({
        title: thread.title,
        author: thread.author,
        community: thread.community,
        postText: thread.postText,
        postTextKey: null,
        postedAt: thread.postedAt,
        fetchedAt: Date.now(),
        fetch: "ok",
        xNote: null,
        reason: null,
        pendingDigest,
        generation: sql`${items.generation} + 1`,
      })
      .where(eq(items.normalizedUrl, normalizedUrl)),
  ];
}

function digestWrites(db: Database, { normalizedUrl, address }: Readonly<ThreadPlace>) {
  const owner = ownerOf(normalizedUrl);

  return digestAfterFetch(db, { itemId: owner.id, address });
}

export function threadPublication(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<StoredThread>,
  pendingDigest: string | null,
) {
  return [
    ...contentWrites(db, place, thread, pendingDigest),
    ...threadWrites(db, ownerOf(place.normalizedUrl), thread, null),
    ...fetchedPartWrites(db, eq(items.normalizedUrl, place.normalizedUrl), thread.postText),
    ...digestWrites(db, place),
  ];
}
