import { type Digest } from "./ai-contract.ts";
import { type SaveResult, itemAt } from "./items.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink, redditRefOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { parseRedditThread } from "./reddit-json.ts";
import { publishThread } from "./thread-save.ts";

export type ThreadPasteResult =
  | SaveResult
  | { readonly kind: "invalid"; readonly field: "content"; readonly reason: string };

const NOT_A_THREAD_LINK = "only a Reddit post or comment link takes content";

export async function saveThread(
  ports: Ports,
  absoluteUrl: string,
  { digest, content }: Readonly<{ digest: Digest | undefined; content: string }>,
): Promise<ThreadPasteResult> {
  const ref = redditRefOf(absoluteUrl);

  if (ref === null) return { kind: "invalid", field: "content", reason: NOT_A_THREAD_LINK };

  const parsed = parseRedditThread(content, ref);

  if (parsed.kind === "refused") {
    return { kind: "invalid", field: "content", reason: parsed.reason };
  }

  const { db } = ports;
  const place = { ...parseLink(absoluteUrl), address: absoluteUrl };

  const created = await publishThread(
    db,
    place,
    parsed.thread,
    digest === undefined ? null : JSON.stringify(digest),
  );

  const item = await itemAt(db, place.normalizedUrl);
  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created };
}
