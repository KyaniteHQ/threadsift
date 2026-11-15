import { redditRefOf } from "./links.ts";
import { parseRedditThread } from "./reddit-json.ts";
import type { StoredParse } from "./stored-thread.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { parseXThread } from "./x-thread.ts";

const NOT_A_THREAD_LINK = "only a Reddit post or comment link or an X post link takes content";

const ONE_X_TEXT = "an X post takes one JSON text of the post and its replies";

function refused(reason: string): StoredParse {
  return { kind: "refused", reason };
}

export function parsedThread(
  absoluteUrl: string,
  statusId: string | null,
  answers: ThreadAnswers,
): StoredParse {
  const ref = redditRefOf(absoluteUrl);

  if (ref !== null) return parseRedditThread(answers, ref);

  if (statusId === null) return refused(NOT_A_THREAD_LINK);

  const [answer, ...later] = answers;

  return later.length === 0 ? parseXThread(answer, statusId) : refused(ONE_X_TEXT);
}
