import { eq, sql } from "drizzle-orm";

import { digestAfterFetch } from "./digest-job.ts";
import { closeItemJobs } from "./job-close.ts";
import type { Link } from "./links.ts";
import type { Database } from "./ports.ts";
import { type Owner, ownerOf, threadWrites } from "./reddit-thread.ts";
import { items, media } from "./schema.ts";
import { fetchedPartWrites } from "./search.ts";
import type { StoredThread } from "./stored-thread.ts";

export interface ThreadPlace extends Link {
  readonly address: string;
  readonly addedByToken: number | null;
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
      addedByToken: place.addedByToken,
    })
    .onConflictDoNothing({ target: items.normalizedUrl })
    .returning({ id: items.id });
}

function contentWrites(
  db: Database,
  { normalizedUrl }: Readonly<ThreadPlace>,
  owner: Readonly<Owner>,
  thread: Readonly<StoredThread>,
  pendingDigest: string | null,
) {
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

export function threadPublication(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<StoredThread>,
  pendingDigest: string | null,
) {
  const owner = ownerOf(place.normalizedUrl);

  return [
    ...contentWrites(db, place, owner, thread, pendingDigest),
    ...threadWrites(db, owner, thread, null),
    ...fetchedPartWrites(db, eq(items.normalizedUrl, place.normalizedUrl), thread.postText),
    ...digestAfterFetch(db, { itemId: owner.id, address: place.address }),
  ];
}
