import { type Fetched, NOT_REQUESTED, detailsOfOembed, detailsOfPage } from "./details.ts";
import { type GuardOutcome, guardedFetch } from "./fetch-guard.ts";
import { type Link, isRedditOrXLink, isShortLink, parseLink } from "./links.ts";
import type { Network } from "./ports.ts";

export interface FetchedLink {
  readonly link: Link;
  readonly fetched: Fetched;
}

function fetchedOfPage(outcome: Readonly<GuardOutcome>): Fetched {
  if (outcome.kind === "page") {
    return detailsOfPage(outcome.text);
  }

  return { status: outcome.kind === "stopped" ? "redirect-stopped" : outcome.reason };
}

async function fetchedOfOembed(network: Network, normalizedUrl: string): Promise<Fetched> {
  const outcome = await guardedFetch(
    network,
    `https://www.reddit.com/oembed?url=${encodeURIComponent(normalizedUrl)}`,
  );

  if (outcome.kind === "page") {
    return detailsOfOembed(outcome.text);
  }

  return { status: outcome.kind === "stopped" ? "unreadable" : outcome.reason };
}

async function fetchedFor(
  network: Network,
  link: Readonly<Link>,
  address: string,
): Promise<Fetched> {
  if (link.kind === "reddit-post" || link.kind === "reddit-comment") {
    return fetchedOfOembed(network, link.normalizedUrl);
  }

  if (link.kind === "x-post" || isRedditOrXLink(address)) {
    return NOT_REQUESTED;
  }

  return fetchedOfPage(await guardedFetch(network, address));
}

async function followShortLink(
  network: Network,
  pasted: Readonly<Link>,
  address: string,
): Promise<FetchedLink> {
  const outcome = await guardedFetch(network, address);

  if (outcome.kind === "failed") {
    return { link: pasted, fetched: { status: outcome.reason } };
  }

  const link = parseLink(outcome.url);

  return {
    link,
    fetched:
      outcome.kind === "page"
        ? detailsOfPage(outcome.text)
        : await fetchedFor(network, link, outcome.url),
  };
}

export async function fetchLink(network: Network, address: string): Promise<FetchedLink> {
  const pasted = parseLink(address);

  if (isShortLink(address)) {
    return followShortLink(network, pasted, address);
  }

  return { link: pasted, fetched: await fetchedFor(network, pasted, address) };
}
