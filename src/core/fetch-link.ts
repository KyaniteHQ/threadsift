import { type Concluded, type Fetched, NOT_REQUESTED, detailsOfPage } from "./details.ts";
import {
  type FetchPolicy,
  type GuardOutcome,
  NO_HEADERS,
  type Page,
  SMALL_BODY_BYTES,
  guardedFetch,
  loggedFailureOf,
} from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { fetchedOfRepository } from "./github-fetch.ts";
import { withCurrentCredential } from "./github-token.ts";
import {
  isRedditOrXLink,
  isRedditShareLink,
  isShortLink,
  parseLink,
  redditRefOf,
} from "./links.ts";
import { detailsOfOembed } from "./oembed-details.ts";
import { PageReadTimeout } from "./page-read-timeout.ts";
import type { Network, PageReader, Ports } from "./ports.ts";
import { repositoryRef } from "./repository-ref.ts";

type ShortLinkResolution =
  | { readonly kind: "resolved"; readonly address: string }
  | { readonly kind: "failed"; readonly fetched: Concluded };

export const FETCH_DEADLINE_MS = 120_000;

export const SMALL_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  followMetaRefresh: isShortLink,
  readsBody: () => true,
  headers: () => NO_HEADERS,
  readsLimits: () => false,
  htmlMaxBytes: SMALL_BODY_BYTES,
  dataMaxBytes: SMALL_BODY_BYTES,
};

const RESOLVE_POLICY: FetchPolicy = { ...SMALL_POLICY, readsBody: isShortLink };

const SHARE_LINK_POLICY: FetchPolicy = {
  ...RESOLVE_POLICY,
  stopAt: () => true,
  followMetaRefresh: () => false,
};

const NOT_A_POST_OR_COMMENT: ShortLinkResolution = {
  kind: "failed",
  fetched: { status: "unresolved" },
};

function pagePolicy({ maxHtmlBytes }: Readonly<PageReader>): FetchPolicy {
  return { ...SMALL_POLICY, htmlMaxBytes: maxHtmlBytes };
}

export async function readOrTimeOut(
  read: () => Promise<Concluded> | Concluded,
): Promise<Concluded> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof PageReadTimeout) {
      return { status: "timeout" };
    }

    throw error;
  }
}

function fetchedOf(
  outcome: Readonly<GuardOutcome>,
  readPage: (page: Readonly<Page>) => Promise<Concluded> | Concluded,
  whenStopped: FetchFailure,
): Promise<Concluded> {
  if (outcome.kind !== "page") {
    return Promise.resolve({ status: loggedFailureOf(outcome, whenStopped) });
  }

  return readOrTimeOut(() => readPage(outcome));
}

async function fetchedOfOembed(
  network: Network,
  normalizedUrl: string,
  deadline: AbortSignal,
): Promise<Concluded> {
  const outcome = await guardedFetch(
    network,
    `https://www.reddit.com/oembed?url=${encodeURIComponent(normalizedUrl)}`,
    SMALL_POLICY,
    deadline,
  );

  return fetchedOf(outcome, ({ text }) => detailsOfOembed(text), "unreadable");
}

export async function fetchLink(
  ports: Readonly<Pick<Ports, "db" | "secrets" | "network" | "pages">>,
  address: string,
  attempts: number,
  deadline: AbortSignal,
): Promise<Fetched> {
  const { network, pages } = ports;
  const link = parseLink(address);

  if (link.kind === "reddit-post" || link.kind === "reddit-comment") {
    return fetchedOfOembed(network, link.normalizedUrl, deadline);
  }

  if (isRedditOrXLink(address)) {
    return NOT_REQUESTED;
  }

  if (link.kind === "github-repo") {
    return withCurrentCredential(ports, (auth) =>
      fetchedOfRepository({ ports, attempts, auth }, repositoryRef(link.normalizedUrl), deadline),
    );
  }

  return fetchedOf(
    await guardedFetch(network, address, pagePolicy(pages), deadline),
    (page) => detailsOfPage(pages, page, link, deadline),
    "redirect-stopped",
  );
}

export async function resolveShortLink(
  network: Network,
  address: string,
): Promise<ShortLinkResolution> {
  const shareLink = isRedditShareLink(address);

  const outcome = await guardedFetch(
    network,
    address,
    shareLink ? SHARE_LINK_POLICY : RESOLVE_POLICY,
    AbortSignal.timeout(FETCH_DEADLINE_MS),
  );

  if (outcome.kind === "failed") {
    return { kind: "failed", fetched: { status: loggedFailureOf(outcome) } };
  }

  return shareLink && redditRefOf(outcome.url) === null
    ? NOT_A_POST_OR_COMMENT
    : { kind: "resolved", address: outcome.url };
}
