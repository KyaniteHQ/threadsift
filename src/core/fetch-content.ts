import type { BatchItem } from "drizzle-orm/batch";

import type { Concluded } from "./details.ts";
import type { ClaimedJob, JobFiles, JobPorts } from "./job-outcome.ts";
import { mediaKeysOf, mediaWrites } from "./media-writes.ts";
import { placePostText } from "./post-text-files.ts";
import { ownerOfItem, threadWrites } from "./reddit-thread.ts";
import { fetchedRepository, repositoryWrites } from "./repositories.ts";
import { settle } from "./settle.ts";
import { storeMedia } from "./store-media.ts";

function archivedOf(fetched: Readonly<Concluded>) {
  return fetched.status === "ok" && fetched.found.content?.kind === "thread"
    ? fetched.found.content
    : null;
}

function contentWrites(
  { db }: Readonly<Pick<JobPorts, "db">>,
  itemId: number,
  fetched: Readonly<Concluded>,
  archived: ReturnType<typeof archivedOf>,
): readonly BatchItem<"sqlite">[] {
  const repository = fetchedRepository(fetched);

  return [
    ...(repository === null ? [] : repositoryWrites(db, itemId, repository)),
    ...(archived === null
      ? []
      : threadWrites(db, ownerOfItem(itemId), archived.thread, archived.archivedAt)),
  ];
}

export async function settledContent(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  title: string | null,
  deadline: AbortSignal,
) {
  const stored = await storeMedia(ports, job, fetched, deadline);
  const { postText, ...settled } = settle(stored.fetched, title, Date.now());
  const replaces = postText !== undefined;

  const [placed, replacedMedia] = await Promise.all([
    placePostText(ports, job, postText),
    replaces ? mediaKeysOf(ports.db, job.itemId) : [],
  ]);

  const mediaPublication: readonly BatchItem<"sqlite">[] = replaces
    ? mediaWrites(ports.db, job.itemId, stored.rows)
    : [];

  const archived = archivedOf(fetched);

  const files: JobFiles = {
    written: [...placed.files.written, ...stored.written],
    superseded: [...placed.files.superseded, ...replacedMedia],
  };

  return {
    postText,
    replaces,
    thread: archived?.thread ?? null,
    fields: { ...settled, ...placed.columns },
    publication: [...contentWrites(ports, job.itemId, fetched, archived), ...mediaPublication],
    files,
  };
}
