import { type Digest } from "./ai-contract.ts";
import { type Invalid, type SaveResult, type ThreadKept, itemAt } from "./items.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink, redditRefOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { type ParsedThread, parseRedditThread } from "./reddit-json.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { type Replacement, publishThread } from "./thread-save.ts";

export type ThreadPasteResult = SaveResult | Invalid<"content"> | ThreadKept;

const NOT_A_THREAD_LINK = "only a Reddit post or comment link takes content";

export async function publish(
  ports: Ports,
  absoluteUrl: string,
  thread: Readonly<ParsedThread>,
  { digest, replacement }: Readonly<{ digest: Digest | undefined; replacement: Replacement }>,
): Promise<SaveResult | ThreadKept> {
  const { db } = ports;
  const place = { ...parseLink(absoluteUrl), address: absoluteUrl };

  const created = await publishThread(db, place, thread, {
    pendingDigest: digest === undefined ? null : JSON.stringify(digest),
    replacement,
  });

  if (created === null) return { kind: "thread-kept" };

  const item = await itemAt(db, place.normalizedUrl);
  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created };
}

export function saveThread(
  ports: Ports,
  absoluteUrl: string,
  { digest, answers }: Readonly<{ digest: Digest | undefined; answers: ThreadAnswers }>,
): Promise<ThreadPasteResult> {
  const ref = redditRefOf(absoluteUrl);

  if (ref === null) {
    return Promise.resolve({ kind: "invalid", field: "content", reason: NOT_A_THREAD_LINK });
  }

  const parsed = parseRedditThread(answers, ref);

  if (parsed.kind === "refused") {
    return Promise.resolve({ kind: "invalid", field: "content", reason: parsed.reason });
  }

  return publish(ports, absoluteUrl, parsed.thread, { digest, replacement: "any" });
}
