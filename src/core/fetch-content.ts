import type { Concluded } from "./details.ts";
import type { FetchedContent } from "./item-publish.ts";
import type { ClaimedJob, JobPorts } from "./job-outcome.ts";
import { mediaKeysOf } from "./media-writes.ts";
import { placePostText } from "./post-text-files.ts";
import { postTextOf } from "./settle.ts";
import { storeMedia } from "./store-media.ts";

export async function settledContent(
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
