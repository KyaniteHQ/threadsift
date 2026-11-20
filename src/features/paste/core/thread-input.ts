import type { ThreadAnswers } from "../../../core/contract/thread-answers.ts";
import { parseRedditThread } from "../../reddit/core/reddit-json.ts";
import type { StoredParse } from "../../thread/core/stored-thread.ts";
import { parseXThread } from "../../x/core/x-thread.ts";
import type { ThreadSource } from "./thread-source.ts";

const NOT_A_THREAD_LINK = "only a Reddit post or comment link or an X post link takes content";

const ONE_X_TEXT = "an X post takes one JSON text of the post and its replies";

function refused(reason: string): StoredParse {
  return { kind: "refused", reason };
}

export function parsedThread(source: Readonly<ThreadSource>, answers: ThreadAnswers): StoredParse {
  switch (source.kind) {
    case "reddit": {
      return parseRedditThread(answers, source.ref);
    }

    case "none": {
      return refused(NOT_A_THREAD_LINK);
    }

    case "x": {
      const [answer, ...later] = answers;

      return later.length === 0 ? parseXThread(answer, source.statusId) : refused(ONE_X_TEXT);
    }

    default: {
      return source satisfies never;
    }
  }
}
