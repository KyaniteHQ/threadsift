import { ITEM_REQUEST_BYTES } from "../../../core/contract/limits.ts";
import type { RedditRef } from "../../../core/contract/links.ts";
import { pause } from "../../../core/contract/pause.ts";
import { RATE_LIMITED } from "../../../core/contract/reddit-http.ts";
import { wholeMillisecondsOf } from "../../../core/contract/time-units.ts";
import {
  type FetchPolicy,
  type GuardOutcome,
  guardedFetch,
} from "../../../core/kernel/fetch-guard.ts";
import type { Network } from "../../../core/kernel/network.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import type { ParsedThread } from "../../thread/core/thread-parse.ts";
import { holdsNoThread } from "../../thread/core/thread-store.ts";
import { parseArchiveThread } from "./archive-thread.ts";
import { archiveFillIsOn } from "./reddit-settings.ts";

export interface ArchivedThread {
  readonly thread: ParsedThread;
  readonly archivedAt: number | null;
}

const ARCHIVE_ORIGIN = "https://arctic-shift.photon-reddit.com";

const MAX_RESET_WAIT_MS = 10_000;

const ARCHIVE_POLICY: FetchPolicy<number> = {
  stopAt: () => true,
  headers: () => ({ accept: "application/json" }),
  answerStatus: (response) =>
    Promise.resolve(
      response.status === RATE_LIMITED ? wholeMillisecondsOf(response.rateLimit.reset) : null,
    ),
  htmlMaxBytes: ITEM_REQUEST_BYTES,
  dataMaxBytes: ITEM_REQUEST_BYTES,
};

function resetWaitOf(outcome: Readonly<GuardOutcome<number>>): number | null {
  if (outcome.kind !== "failed" || outcome.reason !== "status") return null;

  const wait = outcome.answer;

  return wait !== null && wait <= MAX_RESET_WAIT_MS ? wait : null;
}

async function requested(
  network: Network,
  path: string,
  deadline: AbortSignal,
  mayRetry = true,
): Promise<string | null> {
  const outcome = await guardedFetch(network, `${ARCHIVE_ORIGIN}${path}`, ARCHIVE_POLICY, deadline);

  if (outcome.kind === "page") return outcome.cut ? null : outcome.text;

  const wait = mayRetry ? resetWaitOf(outcome) : null;

  if (wait === null) return null;

  await pause(wait, deadline);

  return requested(network, path, deadline, false);
}

async function fetchedThread(
  network: Network,
  ref: Readonly<RedditRef>,
  deadline: AbortSignal,
): Promise<ParsedThread | null> {
  const post = await requested(network, `/api/posts/ids?ids=${ref.postId}`, deadline);

  if (post === null) return null;

  const tree = await requested(
    network,
    `/api/comments/tree?link_id=t3_${ref.postId}&limit=9999`,
    deadline,
  );

  return tree === null ? null : parseArchiveThread(post, tree, ref);
}

export async function archivedThread(
  ports: Readonly<Pick<Ports, "db" | "network">>,
  itemId: number,
  ref: Readonly<RedditRef>,
  deadline: AbortSignal,
): Promise<ArchivedThread | null> {
  if (!(await archiveFillIsOn(ports)) || !(await holdsNoThread(ports.db, itemId))) {
    return null;
  }

  const thread = await fetchedThread(ports.network, ref, deadline);

  return thread === null ? null : { thread, archivedAt: Date.now() };
}
