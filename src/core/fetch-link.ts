import { type Fetched, NOT_REQUESTED, detailsOfOembed, detailsOfPage } from "./details.ts";
import { type FetchPolicy, type GuardOutcome, guardedFetch } from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { type Link, isRedditOrXLink, isShortLink, parseLink } from "./links.ts";
import type { Network } from "./ports.ts";

interface FetchedLink {
  readonly link: Link;
  readonly fetched: Fetched;
}

const POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  followMetaRefresh: isShortLink,
};

function fetchedOf(
  outcome: Readonly<GuardOutcome>,
  readPage: (text: string) => Fetched,
  whenStopped: FetchFailure,
): Fetched {
  if (outcome.kind === "page") {
    return readPage(outcome.text);
  }

  return { status: outcome.kind === "stopped" ? whenStopped : outcome.reason };
}

async function fetchedOfOembed(
  network: Network,
  normalizedUrl: string,
  deadline: AbortSignal,
): Promise<Fetched> {
  const outcome = await guardedFetch(
    network,
    `https://www.reddit.com/oembed?url=${encodeURIComponent(normalizedUrl)}`,
    POLICY,
    deadline,
  );

  return fetchedOf(outcome, detailsOfOembed, "unreadable");
}

async function fetchedFor(
  network: Network,
  link: Readonly<Link>,
  address: string,
  deadline: AbortSignal,
): Promise<Fetched> {
  if (link.kind === "reddit-post" || link.kind === "reddit-comment") {
    return fetchedOfOembed(network, link.normalizedUrl, deadline);
  }

  if (isRedditOrXLink(address)) {
    return NOT_REQUESTED;
  }

  return fetchedOf(
    await guardedFetch(network, address, POLICY, deadline),
    detailsOfPage,
    "redirect-stopped",
  );
}

async function followShortLink(
  network: Network,
  pasted: Readonly<Link>,
  address: string,
  deadline: AbortSignal,
): Promise<FetchedLink> {
  const outcome = await guardedFetch(network, address, POLICY, deadline);

  if (outcome.kind === "stopped") {
    const link = parseLink(outcome.url);

    return { link, fetched: await fetchedFor(network, link, outcome.url, deadline) };
  }

  const link = outcome.kind === "page" ? parseLink(outcome.url) : pasted;

  return { link, fetched: fetchedOf(outcome, detailsOfPage, "redirect-stopped") };
}

export async function fetchLink(
  network: Network,
  address: string,
  deadline: AbortSignal,
): Promise<FetchedLink> {
  const pasted = parseLink(address);

  if (isShortLink(address)) {
    return followShortLink(network, pasted, address, deadline);
  }

  return { link: pasted, fetched: await fetchedFor(network, pasted, address, deadline) };
}
