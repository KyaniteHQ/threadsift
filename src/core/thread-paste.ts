import { type Digest } from "./ai-contract.ts";
import { type Invalid, type NotWaiting, type SaveResult, itemAt } from "./items.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink, redditRefOf, statusIdOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { type ThreadParse, parseRedditThread } from "./reddit-json.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { publishThread } from "./thread-save.ts";
import { parseXThread } from "./x-thread.ts";

export type ThreadPasteResult = SaveResult | Invalid<"content" | "fill"> | NotWaiting;

export const FILL_NEEDS_CONTENT: Invalid<"fill"> = {
  kind: "invalid",
  field: "fill",
  reason: "a fill takes the content of a thread",
};

const FILL_IS_REDDIT_ONLY: Invalid<"fill"> = {
  kind: "invalid",
  field: "fill",
  reason: "only a Reddit thread can be filled",
};

const NOT_A_THREAD_LINK = "only a Reddit post or comment link or an X post link takes content";

const ONE_X_TEXT = "an X post takes one JSON text of the post and its replies";

function refused(reason: string): ThreadParse {
  return { kind: "refused", reason };
}

function parsedThread(
  absoluteUrl: string,
  statusId: string | null,
  answers: ThreadAnswers,
): ThreadParse {
  const ref = redditRefOf(absoluteUrl);

  if (ref !== null) return parseRedditThread(answers, ref);

  if (statusId === null) return refused(NOT_A_THREAD_LINK);

  const [answer, ...later] = answers;

  return later.length === 0 ? parseXThread(answer, statusId) : refused(ONE_X_TEXT);
}

export async function saveThread(
  ports: Ports,
  absoluteUrl: string,
  {
    digest,
    answers,
    fillOnly,
  }: Readonly<{ digest: Digest | undefined; answers: ThreadAnswers; fillOnly: boolean }>,
): Promise<ThreadPasteResult> {
  const statusId = statusIdOf(absoluteUrl);

  if (fillOnly && statusId !== null) return FILL_IS_REDDIT_ONLY;

  const parsed = parsedThread(absoluteUrl, statusId, answers);

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
