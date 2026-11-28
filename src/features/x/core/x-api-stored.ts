import type { Database } from "../../../core/kernel/database.ts";
import type { Fetched } from "../../media/core/details.ts";
import type { StoredThread } from "../../thread/core/stored-thread.ts";
import { concludedOfRefusal } from "./x-api-answer.ts";
import { type XApiReads, threadOf } from "./x-api-map.ts";
import { joinedPost } from "./x-joined-post.ts";
import { readFetchedThread } from "./x-replies-ranked.ts";
import { parseJoinedXThread } from "./x-thread.ts";

export interface ApiRead {
  readonly status: "x-api";
  readonly thread: StoredThread;
}

export const ANSWER_REFUSED: Fetched = concludedOfRefusal("api-answer-refused");

export async function storedOf(
  db: Database,
  itemId: number,
  reads: Readonly<XApiReads>,
): Promise<ApiRead | Fetched> {
  const value = threadOf(reads);

  if (value === null) return ANSWER_REFUSED;

  const ranked = await readFetchedThread(db, itemId, reads.statusId, value, []);

  if (ranked.kind === "refused") return ANSWER_REFUSED;

  const every = new Set(ranked.thread.replies.map(({ id }) => id));
  const parsed = parseJoinedXThread(joinedPost(ranked.thread, every, {}), reads.statusId, {
    xApiRead: true,
  });

  return parsed.kind === "thread" ? { status: "x-api", thread: parsed.thread } : ANSWER_REFUSED;
}
