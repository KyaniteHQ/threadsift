import { type Digest } from "./ai-contract.ts";
import { type Invalid, type NotWaiting, type SaveResult, itemAt } from "./items.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink, redditRefOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { parseRedditThread } from "./reddit-json.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { publishThread } from "./thread-save.ts";

export type ThreadPasteResult = SaveResult | Invalid<"content" | "fill"> | NotWaiting;

export const FILL_NEEDS_CONTENT: Invalid<"fill"> = {
  kind: "invalid",
  field: "fill",
  reason: "a fill takes the content of a thread",
};

const NOT_A_THREAD_LINK = "only a Reddit post or comment link takes content";

export async function saveThread(
  ports: Ports,
  absoluteUrl: string,
  {
    digest,
    answers,
    fillOnly,
  }: Readonly<{ digest: Digest | undefined; answers: ThreadAnswers; fillOnly: boolean }>,
): Promise<ThreadPasteResult> {
  const ref = redditRefOf(absoluteUrl);

  if (ref === null) return { kind: "invalid", field: "content", reason: NOT_A_THREAD_LINK };

  const parsed = parseRedditThread(answers, ref);

  if (parsed.kind === "refused") {
    return { kind: "invalid", field: "content", reason: parsed.reason };
  }

  const { db } = ports;
  const place = { ...parseLink(absoluteUrl), address: absoluteUrl };

  const created = await publishThread(db, place, parsed.thread, {
    pendingDigest: digest === undefined ? null : JSON.stringify(digest),
    fillOnly,
  });

  if (created === null) return { kind: "not-waiting" };

  const item = await itemAt(db, place.normalizedUrl);
  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created };
}
