import { eq } from "drizzle-orm";

import type { ClaimedJob, JobFiles, JobPorts } from "./job-outcome.ts";
import { items } from "./schema.ts";

export const INLINE_TEXT_BYTES = 1_000_000;

const ENCODER = new TextEncoder();

export interface PlacedText {
  readonly columns: Readonly<{ postText: string | null; postTextKey: string | null }> | null;
  readonly files: JobFiles;
}

const UNCHANGED: PlacedText = { columns: null, files: { written: null, superseded: null } };

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

  const superseded = await keyOf(ports, job.itemId);
  const bytes = text === null ? null : ENCODER.encode(text);

  if (bytes === null || bytes.length <= INLINE_TEXT_BYTES) {
    return { columns: { postText: text, postTextKey: null }, files: { written: null, superseded } };
  }

  const written = job.attemptKey;
  await ports.files.put(written, bytes);

  return { columns: { postText: null, postTextKey: written }, files: { written, superseded } };
}
