import { type Digest } from "./ai-contract.ts";
import { type SaveResult, itemAt } from "./items.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink, redditRefOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { type ParsedThread, parseRedditThread } from "./reddit-json.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { publishThread } from "./thread-save.ts";

interface ContentRefusal {
  readonly kind: "invalid";
  readonly field: "content";
  readonly reason: string;
}

export type ThreadPasteResult = SaveResult | ContentRefusal;

const NOT_A_THREAD_LINK = "only a Reddit post or comment link takes content";

export async function publish(
  ports: Ports,
  absoluteUrl: string,
  thread: Readonly<ParsedThread>,
  digest: Digest | undefined,
): Promise<SaveResult> {
  const { db } = ports;
  const place = { ...parseLink(absoluteUrl), address: absoluteUrl };

  const created = await publishThread(
    db,
    place,
    thread,
    digest === undefined ? null : JSON.stringify(digest),
  );

  const item = await itemAt(db, place.normalizedUrl);
  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created };
}

export function saveThread(
  ports: Ports,
  absoluteUrl: string,
  { digest, answers }: Readonly<{ digest: Digest | undefined; answers: ThreadAnswers }>,
): Promise<SaveResult> | ContentRefusal {
  const ref = redditRefOf(absoluteUrl);

  if (ref === null) return { kind: "invalid", field: "content", reason: NOT_A_THREAD_LINK };

  const parsed = parseRedditThread(answers, ref);

  if (parsed.kind === "refused") {
    return { kind: "invalid", field: "content", reason: parsed.reason };
  }

  return publish(ports, absoluteUrl, parsed.thread, digest);
}
