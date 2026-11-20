import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { MediaRowValue } from "./article-images.ts";
import type { Database } from "./database.ts";
import type { Concluded } from "./details.ts";
import { closeItemJobs } from "./job-close.ts";
import {
  type AnchoredOutcome,
  type JobFiles,
  NO_FILES,
  type SettledOutcome,
} from "./job-outcome.ts";
import { mediaWrites } from "./media-writes.ts";
import { type ItemAt, anchoredSequence, settledSequence } from "./publish-sequence.ts";
import { fetchedRepository, repositoryWrites } from "./repositories.ts";
import { items, media } from "./schema.ts";
import { fetchedThread, settle } from "./settle.ts";
import type { StoredThread } from "./stored-thread.ts";
import { ownerOf, ownerOfItem, threadWrites } from "./thread-store.ts";

export interface FetchedContent {
  readonly concluded: Concluded;
  readonly title: string | null;
  readonly columns: Readonly<{ postText: string | null; postTextKey: string | null }> | null;
  readonly images: readonly MediaRowValue[];
  readonly files: JobFiles;
  readonly suppliedDigest: string | null;
}

function archivedOf(concluded: Readonly<Concluded>) {
  return concluded.status === "ok" && concluded.found.content?.kind === "thread"
    ? concluded.found.content
    : null;
}

function fetchedRows(
  db: Database,
  itemId: number,
  concluded: Readonly<Concluded>,
  archived: ReturnType<typeof archivedOf>,
): readonly BatchItem<"sqlite">[] {
  const repository = fetchedRepository(concluded);

  return [
    ...(repository === null ? [] : repositoryWrites(db, itemId, repository)),
    ...(archived === null
      ? []
      : threadWrites(db, ownerOfItem(itemId), archived.thread, archived.archivedAt)),
  ];
}

export function publishFetched(
  db: Database,
  job: Readonly<{ itemId: number; address: string }>,
  { concluded, title, columns, images, files, suppliedDigest }: Readonly<FetchedContent>,
): Promise<SettledOutcome> | SettledOutcome {
  const { postText, ...settled } = settle(concluded, title, Date.now());
  const archived = archivedOf(concluded);
  const storesText = (postText !== undefined && postText !== null) || archived !== null;

  const at: ItemAt = {
    where: eq(items.id, job.itemId),
    owner: ownerOfItem(job.itemId),
    address: job.address,
  };

  return settledSequence(db, at, {
    fields: { ...settled, ...columns },
    postText,
    pendingDigest: storesText ? (suppliedDigest ?? items.pendingDigest) : null,
    nodes: archived?.thread.nodes,
    closing: [],
    beforeParts: [],
    afterParts: [
      ...fetchedRows(db, job.itemId, concluded, archived),
      ...(postText === undefined ? [] : mediaWrites(db, job.itemId, images)),
    ],
    files,
  });
}

export function publishSupplied(
  db: Database,
  place: Readonly<{ normalizedUrl: string; address: string }>,
  thread: Readonly<StoredThread>,
  pendingDigest: string | null,
): Promise<AnchoredOutcome> {
  const owner = ownerOf(place.normalizedUrl);

  const at: ItemAt = {
    where: eq(items.normalizedUrl, place.normalizedUrl),
    owner,
    address: place.address,
  };

  return anchoredSequence(db, at, {
    fields: { ...settle(fetchedThread(thread), null, Date.now()), postTextKey: null },
    postText: thread.postText,
    pendingDigest,
    nodes: thread.nodes,
    closing: [...closeItemJobs(db, owner.id), db.delete(media).where(eq(media.itemId, owner.id))],
    beforeParts: threadWrites(db, owner, thread, null),
    afterParts: [],
    files: NO_FILES,
  });
}
