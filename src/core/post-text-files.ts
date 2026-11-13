import { eq } from "drizzle-orm";

import { type ClaimedJob, type JobFiles, type JobPorts, NO_FILES } from "./job-outcome.ts";
import { INLINE_TEXT_BYTES } from "./limits.ts";
import { items } from "./schema.ts";

const ENCODER = new TextEncoder();

interface PlacedText {
  readonly columns: Readonly<{ postText: string | null; postTextKey: string | null }> | null;
  readonly files: JobFiles;
}

const UNCHANGED: PlacedText = { columns: null, files: NO_FILES };

async function keyOf(ports: Pick<JobPorts, "db">, itemId: number): Promise<string | null> {
  const [row] = await ports.db
    .select({ key: items.postTextKey })
    .from(items)
    .where(eq(items.id, itemId));

  return row?.key ?? null;
}

export async function placePostText(
  ports: Pick<JobPorts, "db" | "files">,
  job: Readonly<Pick<ClaimedJob, "itemId" | "attemptKey">>,
  text: string | null | undefined,
): Promise<PlacedText> {
  if (text === undefined) return UNCHANGED;

  const previous = await keyOf(ports, job.itemId);
  const superseded = previous === null ? [] : [previous];
  const bytes = text === null ? null : ENCODER.encode(text);

  if (bytes === null || bytes.length <= INLINE_TEXT_BYTES) {
    return { columns: { postText: text, postTextKey: null }, files: { written: [], superseded } };
  }

  const written = job.attemptKey;
  await ports.files.put(written, bytes);

  return {
    columns: { postText: null, postTextKey: written },
    files: { written: [written], superseded },
  };
}
