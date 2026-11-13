import { redditRefOf } from "./links.ts";
import type { Database } from "./ports.ts";
import { type ThreadParse, parseRedditThread, type ParsedThread } from "./reddit-json.ts";
import { ownerOf } from "./reddit-thread.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import type { ThreadPlace } from "./thread-publish.ts";
import { fewerThanStored } from "./x-partial.ts";
import { parseXThread } from "./x-thread.ts";

const NOT_A_THREAD_LINK = "only a Reddit post or comment link or an X post link takes content";

const ONE_X_TEXT = "an X post takes one JSON text of the post and its replies";

function refused(reason: string): ThreadParse {
  return { kind: "refused", reason };
}

export function parsedThread(
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

export function fewerThanSaved(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<ParsedThread>,
): Promise<boolean> {
  return place.kind === "x-post"
    ? fewerThanStored(db, ownerOf(place.normalizedUrl), thread)
    : Promise.resolve(false);
}
