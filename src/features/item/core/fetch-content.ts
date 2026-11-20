import { eq } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import type { ClaimedJob, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { items } from "../../../core/kernel/schema.ts";
import type { Concluded } from "../../media/core/details.ts";
import { mediaKeysOf } from "../../media/core/media-writes.ts";
import { storeMedia } from "../../media/core/store-media.ts";
import { placePostText } from "../../thread/core/post-text-files.ts";
import type { StoredThread } from "../../thread/core/stored-thread.ts";
import { type FetchedContent, publishFetched } from "./item-publish.ts";
import { fetchedThread, isRetryable, postTextOf } from "./settle.ts";

async function settledContent(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  title: string | null,
  deadline: AbortSignal,
  suppliedDigest: string | null,
): Promise<FetchedContent> {
  const stored = await storeMedia(ports, job, fetched, deadline);
  const postText = postTextOf(stored.fetched);

  const [placed, replacedMedia] = await Promise.all([
    placePostText(ports, job, postText),
    postText === undefined ? [] : mediaKeysOf(ports.db, job.itemId),
  ]);

  return {
    concluded: stored.fetched,
    title,
    columns: placed.columns,
    images: stored.rows,
    files: {
      written: [...placed.files.written, ...stored.written],
      superseded: [...placed.files.superseded, ...replacedMedia],
    },
    suppliedDigest,
  };
}

async function titleOf(db: Database, itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

export async function settledFetch(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  deadline: AbortSignal,
  suppliedDigest: string | null,
) {
  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;

  return publishFetched(
    ports.db,
    job,
    await settledContent(ports, job, fetched, title, deadline, suppliedDigest),
  );
}

export function settledThread(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  thread: Readonly<StoredThread>,
  deadline: AbortSignal,
  suppliedDigest: string | null,
) {
  return settledFetch(ports, job, fetchedThread(thread), deadline, suppliedDigest);
}
