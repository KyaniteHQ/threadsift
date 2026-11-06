import { type Fetched, NOT_REQUESTED, detailsOfOembed, detailsOfPage } from "./details.ts";
import { type FetchPolicy, type GuardOutcome, type Page, guardedFetch } from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { isRedditOrXLink, isShortLink, parseLink } from "./links.ts";
import type { Network } from "./ports.ts";

export type ShortLinkResolution =
  | { readonly kind: "resolved"; readonly address: string }
  | { readonly kind: "failed"; readonly fetched: Fetched };

export const FETCH_DEADLINE_MS = 120_000;

const PAGE_CAP_BYTES = 5 * 1024 * 1024;
const SMALL_CAP_BYTES = 512 * 1024;

const PAGE_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  followMetaRefresh: isShortLink,
  maxBytes: () => PAGE_CAP_BYTES,
};

const SMALL_POLICY: FetchPolicy = { ...PAGE_POLICY, maxBytes: () => SMALL_CAP_BYTES };

const RESOLVE_POLICY: FetchPolicy = {
  ...PAGE_POLICY,
  maxBytes: (url) => (isShortLink(url) ? SMALL_CAP_BYTES : 0),
};

function fetchedOf(
  outcome: Readonly<GuardOutcome>,
  readPage: (page: Readonly<Page>) => Promise<Fetched> | Fetched,
  whenStopped: FetchFailure,
): Promise<Fetched> {
  if (outcome.kind === "page") {
    return Promise.resolve(readPage(outcome));
  }

  return Promise.resolve({ status: outcome.kind === "stopped" ? whenStopped : outcome.reason });
}

async function fetchedOfOembed(
  network: Network,
  normalizedUrl: string,
  deadline: AbortSignal,
): Promise<Fetched> {
  const outcome = await guardedFetch(
    network,
    `https://www.reddit.com/oembed?url=${encodeURIComponent(normalizedUrl)}`,
    SMALL_POLICY,
    deadline,
  );

  return fetchedOf(outcome, ({ text }) => detailsOfOembed(text), "unreadable");
}

export async function fetchLink(network: Network, address: string): Promise<Fetched> {
  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const link = parseLink(address);

  if (link.kind === "reddit-post" || link.kind === "reddit-comment") {
    return fetchedOfOembed(network, link.normalizedUrl, deadline);
  }

  if (isRedditOrXLink(address)) {
    return NOT_REQUESTED;
  }

  return fetchedOf(
    await guardedFetch(network, address, PAGE_POLICY, deadline),
    (page) => detailsOfPage(page, link),
    "redirect-stopped",
  );
}

export async function resolveShortLink(
  network: Network,
  address: string,
): Promise<ShortLinkResolution> {
  const outcome = await guardedFetch(
    network,
    address,
    RESOLVE_POLICY,
    AbortSignal.timeout(FETCH_DEADLINE_MS),
  );

  return outcome.kind === "failed"
    ? { kind: "failed", fetched: { status: outcome.reason } }
    : { kind: "resolved", address: outcome.url };
}
