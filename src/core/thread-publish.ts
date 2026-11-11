import { and, eq, exists, not, notExists, sql } from "drizzle-orm";

import { digestAfterFetch } from "./digest-job.ts";
import { hasDigestSource, setDigestFailure } from "./digest-source.ts";
import { closeFetchJobs, hasOpenJob } from "./job-rows.ts";
import type { Link } from "./links.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import { ownerOf, threadWrites } from "./reddit-thread.ts";
import { digests, items } from "./schema.ts";
import { fetchedPartWrites } from "./search.ts";

export interface ThreadPlace extends Link {
  readonly address: string;
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
      status: "processing",
    })
    .onConflictDoNothing({ target: items.normalizedUrl })
    .returning({ id: items.id });
}

function contentWrites(
  db: Database,
  { normalizedUrl }: Readonly<ThreadPlace>,
  thread: Readonly<ParsedThread>,
  pendingDigest: string | null,
) {
  const owner = ownerOf(normalizedUrl);

  return [
    closeFetchJobs(db, owner.id),
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
        pendingDigest,
        generation: sql`${items.generation} + 1`,
      })
      .where(eq(items.normalizedUrl, normalizedUrl)),
  ];
}

function digestWrites(db: Database, { normalizedUrl, address }: Readonly<ThreadPlace>) {
  const owner = ownerOf(normalizedUrl);

  return [
    db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(eq(items.normalizedUrl, normalizedUrl), not(hasDigestSource()))),
    ...digestAfterFetch(db, { itemId: owner.id, address }),
    setDigestFailure(
      db,
      owner.id,
      true,
      and(
        notExists(hasOpenJob("digest")),
        exists(db.select({ id: digests.itemId }).from(digests).where(eq(digests.itemId, items.id))),
      ) ?? sql`0`,
    ),
    db
      .update(items)
      .set({
        status: sql`case when exists ${hasOpenJob()} then 'processing' else 'ready' end`,
        reason: null,
      })
      .where(eq(items.normalizedUrl, normalizedUrl)),
  ];
}

export function threadPublication(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<ParsedThread>,
  pendingDigest: string | null,
) {
  return [
    ...contentWrites(db, place, thread, pendingDigest),
    ...threadWrites(db, ownerOf(place.normalizedUrl), thread, null),
    ...fetchedPartWrites(db, eq(items.normalizedUrl, place.normalizedUrl), thread.postText),
    ...digestWrites(db, place),
  ];
}
