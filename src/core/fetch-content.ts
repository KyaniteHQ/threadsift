import type { BatchItem } from "drizzle-orm/batch";

import { type MediaRowValue, prepareMedia } from "./article-images.ts";
import type { Concluded } from "./details.ts";
import type { ClaimedJob, JobFiles, JobPorts } from "./job-outcome.ts";
import { mediaKeysOf, mediaWrites } from "./media-writes.ts";
import { placePostText } from "./post-text-files.ts";
import { settle } from "./settle.ts";

interface StoredMedia {
  readonly fetched: Concluded;
  readonly rows: readonly MediaRowValue[];
  readonly written: readonly string[];
}

async function storeMedia(
  ports: JobPorts,
  prefix: string,
  fetched: Readonly<Concluded>,
  deadline: AbortSignal,
): Promise<StoredMedia> {
  const content = fetched.status === "ok" ? fetched.found.content : null;

  if (fetched.status !== "ok" || content?.kind !== "article") {
    return { fetched, rows: [], written: [] };
  }

  const plan = await prepareMedia(ports, prefix, content, deadline);

  return {
    fetched: {
      ...fetched,
      found: { ...fetched.found, content: { ...content, postText: plan.postText } },
    },
    rows: plan.rows,
    written: plan.written,
  };
}

export async function settledContent(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  title: string | null,
  deadline: AbortSignal,
) {
  const stored = await storeMedia(ports, job.imagePrefix, fetched, deadline);
  const { postText, ...settled } = settle(stored.fetched, title, Date.now());
  const replaces = postText !== undefined;

  const [placed, replacedMedia] = await Promise.all([
    placePostText(ports, job, postText),
    replaces ? mediaKeysOf(ports.db, job.itemId) : [],
  ]);

  const mediaPublication: readonly BatchItem<"sqlite">[] = replaces
    ? mediaWrites(ports.db, job.itemId, stored.rows)
    : [];

  const files: JobFiles = {
    written: [...placed.files.written, ...stored.written],
    superseded: [...placed.files.superseded, ...replacedMedia],
  };

  return {
    postText,
    replaces,
    fields: { ...settled, ...placed.columns },
    mediaPublication,
    files,
  };
}
