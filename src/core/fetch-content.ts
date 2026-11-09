import type { BatchItem } from "drizzle-orm/batch";

import type { Concluded } from "./details.ts";
import { storeMedia } from "./fetch-media.ts";
import type { ClaimedJob, JobFiles, JobPorts } from "./job-outcome.ts";
import { mediaKeysOf, mediaWrites } from "./media-writes.ts";
import { placePostText } from "./post-text-files.ts";
import { settle } from "./settle.ts";

export async function settledContent(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  title: string | null,
  deadline: AbortSignal,
) {
  const stored = await storeMedia(ports, job.imagePrefix, fetched, deadline);
  const { postText, ...settled } = settle(stored.fetched, title, Date.now());
  const placed = await placePostText(ports, job, postText);
  const replaces = postText !== undefined;

  const mediaPublication: readonly BatchItem<"sqlite">[] = replaces
    ? mediaWrites(ports.db, job.itemId, stored.rows)
    : [];

  const files: JobFiles = {
    written: [...placed.files.written, ...stored.written],
    superseded: [
      ...placed.files.superseded,
      ...(replaces ? await mediaKeysOf(ports.db, job.itemId) : []),
    ],
  };

  return { postText, fields: { ...settled, ...placed.columns }, mediaPublication, files };
}
