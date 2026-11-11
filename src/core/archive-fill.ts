import { redditJsonOfArchive } from "./archive-adapter.ts";
import { type FetchPolicy, type GuardOutcome, guardedFetch } from "./fetch-guard.ts";
import { ITEM_REQUEST_BYTES } from "./limits.ts";
import type { RedditRef } from "./links.ts";
import { pause } from "./pause.ts";
import type { Network, Ports } from "./ports.ts";
import { type ParsedThread, parseRedditThread } from "./reddit-json.ts";
import { archiveFillIsOn } from "./reddit-settings.ts";
import { noThreadFor } from "./reddit-thread.ts";
import { guardHolds } from "./schema.ts";

export interface ArchivedThread {
  readonly thread: ParsedThread;
  readonly archivedAt: number;
}

const ARCHIVE_ORIGIN = "https://arctic-shift.photon-reddit.com";

const MAX_RESET_WAIT_MS = 10_000;

const TOO_MANY_REQUESTS = 429;

const WHOLE_SECONDS = /^\d+$/u;

const MS_PER_SECOND = 1000;

const ARCHIVE_POLICY: FetchPolicy = {
  stopAt: () => true,
  followMetaRefresh: () => false,
  readsBody: () => true,
  headers: () => ({ accept: "application/json" }),
  readsLimits: () => false,
  htmlMaxBytes: ITEM_REQUEST_BYTES,
  dataMaxBytes: ITEM_REQUEST_BYTES,
};

function resetWaitOf(outcome: Readonly<GuardOutcome>): number | null {
  if (
    outcome.kind !== "failed" ||
    outcome.reason !== "status" ||
    outcome.httpStatus !== TOO_MANY_REQUESTS ||
    outcome.reset === null ||
    !WHOLE_SECONDS.test(outcome.reset.trim())
  ) {
    return null;
  }

  const wait = Number(outcome.reset) * MS_PER_SECOND;

  return wait <= MAX_RESET_WAIT_MS ? wait : null;
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

  await pause(wait);

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

  const json = tree === null ? null : redditJsonOfArchive(post, tree);

  if (json === null) return null;

  const parsed = parseRedditThread([json], ref);

  return parsed.kind === "thread" ? parsed.thread : null;
}

export async function archivedThread(
  ports: Readonly<Pick<Ports, "db" | "network">>,
  itemId: number,
  ref: Readonly<RedditRef>,
  deadline: AbortSignal,
): Promise<ArchivedThread | null> {
  if (!(await archiveFillIsOn(ports)) || !(await guardHolds(ports.db, noThreadFor(itemId)))) {
    return null;
  }

  const thread = await fetchedThread(ports.network, ref, deadline);

  return thread === null ? null : { thread, archivedAt: Date.now() };
}
