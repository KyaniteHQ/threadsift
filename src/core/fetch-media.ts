import { type ImageSink, type MediaRowValue, prepareMedia } from "./article-images.ts";
import type { Concluded } from "./details.ts";

export interface FetchedMedia {
  readonly fetched: Concluded;
  readonly rows: readonly MediaRowValue[];
  readonly written: readonly string[];
}

export async function storeMedia(
  sink: Readonly<ImageSink>,
  prefix: string,
  fetched: Readonly<Concluded>,
  deadline: AbortSignal,
): Promise<FetchedMedia> {
  const content = fetched.status === "ok" ? fetched.found.content : null;

  if (fetched.status !== "ok" || content?.kind !== "article") {
    return { fetched, rows: [], written: [] };
  }

  const plan = await prepareMedia(sink, prefix, content, deadline);

  return {
    fetched: {
      ...fetched,
      found: { ...fetched.found, content: { ...content, postText: plan.postText } },
    },
    rows: plan.rows,
    written: plan.written,
  };
}
