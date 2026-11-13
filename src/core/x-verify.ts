import { guardedFetch } from "./fetch-guard.ts";
import { SMALL_POLICY } from "./fetch-link.ts";
import type { Network } from "./ports.ts";
import {
  type Judgement,
  MAX_LINKS,
  type OembedAnswer,
  type Resolved,
  type StoredPost,
  judged,
  oembedAnswerOf,
  resolutionsNeeded,
} from "./x-oembed.ts";
import { type Judged, sliceOf } from "./x-verify-state.ts";
import type { XThreadValue } from "./x-wire.ts";

const OEMBED = "https://publish.x.com/oembed";
const SHORT_LINK_HOST = "t.co";
const CONCURRENT_REQUESTS = 4;

const POLICY = {
  ...SMALL_POLICY,
  stopAt: () => true,
  followMetaRefresh: () => false,
  readsForbiddenBody: (url: string) => url.startsWith(OEMBED),
};

type Resolution =
  | { readonly kind: "address"; readonly address: string }
  | { readonly kind: "unresolved" }
  | { readonly kind: "unavailable" };

interface Slice {
  readonly added: Judged;
  readonly requests: number;
  readonly unavailable: boolean;
}

const UNAVAILABLE: OembedAnswer = { kind: "unavailable" };

async function answerFor(network: Network, id: string, signal: AbortSignal): Promise<OembedAnswer> {
  const url = `${OEMBED}?url=${encodeURIComponent(`https://x.com/i/status/${id}`)}&omit_script=1`;
  const outcome = await guardedFetch(network, url, POLICY, signal);

  if (outcome.kind === "page") {
    return outcome.cut ? UNAVAILABLE : oembedAnswerOf(200, outcome.text);
  }

  return outcome.kind === "failed" && outcome.reason === "status"
    ? oembedAnswerOf(outcome.httpStatus, outcome.body ?? "")
    : UNAVAILABLE;
}

export async function shownOnX(
  network: Network,
  id: string,
  signal: AbortSignal,
): Promise<"shown" | "absent" | "unavailable"> {
  const { kind } = await answerFor(network, id, signal);

  if (kind === "absent") return "absent";

  return kind === "post" ? "shown" : "unavailable";
}

function isShortLink(href: string): boolean {
  return (
    URL.canParse(href) &&
    new URL(href).protocol === "https:" &&
    new URL(href).hostname === SHORT_LINK_HOST
  );
}

async function resolution(
  network: Network,
  href: string,
  signal: AbortSignal,
): Promise<Resolution> {
  if (!isShortLink(href)) return { kind: "unresolved" };

  const outcome = await guardedFetch(network, href, POLICY, signal);

  if (outcome.kind === "stopped") return { kind: "address", address: outcome.url };

  if (outcome.kind === "failed" && outcome.reason === "status") {
    return outcome.httpStatus === 404 || outcome.httpStatus === 410
      ? { kind: "unresolved" }
      : { kind: "unavailable" };
  }

  return outcome.kind === "failed" && outcome.reason !== "refused"
    ? { kind: "unavailable" }
    : { kind: "unresolved" };
}

interface Asking {
  readonly isStopped: () => boolean;
  readonly stop: () => void;
  readonly counted: () => void;
}

function openAsking() {
  let stopped = false;
  let requests = 0;

  return {
    asking: {
      isStopped: () => stopped,
      stop: () => {
        stopped = true;
      },
      counted: () => {
        requests += 1;
      },
    },
    requests: () => requests,
  };
}

async function resolvedAll(
  network: Network,
  hrefs: readonly string[],
  signal: AbortSignal,
  asking: Readonly<Asking>,
  known: readonly (readonly [string, string])[] = [],
): Promise<Resolved | null> {
  const [href, ...rest] = hrefs;

  if (href === undefined) return new Map(known);

  if (asking.isStopped()) return null;

  asking.counted();

  const found = await resolution(network, href, signal);

  if (found.kind === "unavailable") return null;

  return resolvedAll(
    network,
    rest,
    signal,
    asking,
    found.kind === "address" ? [...known, [href, found.address]] : known,
  );
}

async function checkedPost(
  network: Network,
  stored: Readonly<StoredPost>,
  signal: AbortSignal,
  asking: Readonly<Asking>,
  isRoot: boolean,
): Promise<Judgement | null> {
  asking.counted();

  const answer = await answerFor(network, stored.id, signal);

  if (answer.kind === "absent" || (answer.kind === "unusable" && !isRoot)) return "rejected";

  const resolved =
    answer.kind === "post"
      ? await resolvedAll(
          network,
          answer.post.links.length > MAX_LINKS ? [] : resolutionsNeeded(stored.text, answer.post),
          signal,
          asking,
        )
      : null;

  if (answer.kind !== "post" || resolved === null) {
    asking.stop();

    return null;
  }

  return judged(stored, answer.post, resolved);
}

export async function askedSlice(
  network: Network,
  thread: Readonly<XThreadValue>,
  judgedSoFar: Judged,
  signal: AbortSignal,
): Promise<Slice> {
  const { asking, requests } = openAsking();
  const queue = [...sliceOf(thread, judgedSoFar)];
  const added: Record<string, Judgement> = {};

  const work = async (): Promise<void> => {
    const stored = queue.shift();

    if (stored === undefined || asking.isStopped()) return;

    const judgement = await checkedPost(
      network,
      stored,
      signal,
      asking,
      stored.id === thread.post.id,
    );

    if (judgement !== null) added[stored.id] = judgement;

    return work();
  };

  await Promise.all(Array.from({ length: CONCURRENT_REQUESTS }, work));

  return { added, requests: requests(), unavailable: asking.isStopped() };
}
