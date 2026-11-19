import type { SQLWrapper } from "drizzle-orm";

import type { Invalid, NotWaiting } from "./paste-outcome.ts";
import { awaitsThread, ownerOf } from "./reddit-thread.ts";
import type { StoredThread } from "./stored-thread.ts";
import type { ThreadPlace } from "./thread-publish.ts";
import { holdsAtLeastStored, repliesOf } from "./x-partial.ts";

export type Refusal = NotWaiting | Invalid<"content">;

export interface Requirement {
  readonly holds: Readonly<SQLWrapper>;
  readonly refusal: Refusal;
}

const NOT_WAITING: NotWaiting = { kind: "not-waiting" };

const FEWER_REPLIES: Invalid<"content"> = {
  kind: "invalid",
  field: "content",
  reason: "the thread has fewer replies than the saved one, so the saved one was kept",
};

export function requirementOf(
  place: Readonly<ThreadPlace>,
  thread: Readonly<StoredThread>,
  fillOnly: boolean,
): Requirement | undefined {
  if (fillOnly) return { holds: awaitsThread(place.normalizedUrl), refusal: NOT_WAITING };

  if (place.kind !== "x-post") return undefined;

  return {
    holds: holdsAtLeastStored(ownerOf(place.normalizedUrl).id, repliesOf(thread)),
    refusal: FEWER_REPLIES,
  };
}
