import type { Digest } from "./ai-contract.ts";
import { guardedWrite } from "./guards.ts";
import { type SaveResult, type ThreadKept, itemAt, queuedWrites } from "./items.ts";
import { closeFetchJobs } from "./job-close.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink } from "./links.ts";
import type { Ports } from "./ports.ts";
import { hasNoThread, ownerOf } from "./reddit-thread.ts";
import type { SuppliedPage } from "./supplied-page.ts";

export async function saveThreadPage(
  ports: Ports,
  absoluteUrl: string,
  {
    digest,
    page,
    addedByToken,
  }: Readonly<{ digest: Digest | undefined; page: SuppliedPage; addedByToken: number | null }>,
): Promise<SaveResult | ThreadKept> {
  const { db } = ports;
  const link = parseLink(absoluteUrl);

  const [insert, ...rest] = queuedWrites(
    db,
    { originalUrl: absoluteUrl, address: absoluteUrl, digest, addedByToken },
    link,
    JSON.stringify(page),
  );

  const inserted = await guardedWrite(db, hasNoThread(link.normalizedUrl), insert, [
    closeFetchJobs(db, ownerOf(link.normalizedUrl).id),
    ...rest,
  ]);

  if (inserted === null) return { kind: "thread-kept" };

  const item = await itemAt(db, link.normalizedUrl);
  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created: inserted.length > 0 };
}
