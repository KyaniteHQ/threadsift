import {
  type Concluded,
  type Fetched,
  NOT_REQUESTED,
  detailsOfOembed,
  detailsOfPage,
} from "./details.ts";
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
import { loadGithubAuth } from "./github-token.ts";
import { isRedditOrXLink, isShortLink, parseLink } from "./links.ts";
import { PageReadTimeout } from "./page-read-timeout.ts";
import type { Network, PageReader, Ports } from "./ports.ts";
import { repositoryRef } from "./repository-ref.ts";

export type ShortLinkResolution =
  | { readonly kind: "resolved"; readonly address: string }
  | { readonly kind: "failed"; readonly fetched: Concluded };

export const FETCH_DEADLINE_MS = 120_000;

const SMALL_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  followMetaRefresh: isShortLink,
  readsBody: () => true,
  headers: () => NO_HEADERS,
  readsLimits: () => false,
  htmlMaxBytes: SMALL_BODY_BYTES,
  dataMaxBytes: SMALL_BODY_BYTES,
};

const RESOLVE_POLICY: FetchPolicy = { ...SMALL_POLICY, readsBody: isShortLink };

function pagePolicy({ maxHtmlBytes }: Readonly<PageReader>): FetchPolicy {
  return { ...SMALL_POLICY, htmlMaxBytes: maxHtmlBytes };
}

async function fetchedOf(
  outcome: Readonly<GuardOutcome>,
  readPage: (page: Readonly<Page>) => Promise<Concluded> | Concluded,
  whenStopped: FetchFailure,
): Promise<Concluded> {
  if (outcome.kind !== "page") {
    return { status: loggedFailureOf(outcome, whenStopped) };
  }

  try {
    return await readPage(outcome);
  } catch (error) {
    if (error instanceof PageReadTimeout) {
      return { status: "timeout" };
    }

    throw error;
  }
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
  ports: Readonly<Pick<Ports, "db" | "ai" | "network" | "pages">>,
  address: string,
  attempts: number,
): Promise<Fetched> {
  const { network, pages } = ports;
  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const link = parseLink(address);

  if (link.kind === "reddit-post" || link.kind === "reddit-comment") {
    return fetchedOfOembed(network, link.normalizedUrl, deadline);
  }

  if (isRedditOrXLink(address)) {
    return NOT_REQUESTED;
  }

  if (link.kind === "github-repo") {
    return fetchedOfRepository(
      { ports, attempts },
      repositoryRef(link.normalizedUrl),
      await loadGithubAuth(ports),
      deadline,
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
  const outcome = await guardedFetch(
    network,
    address,
    RESOLVE_POLICY,
    AbortSignal.timeout(FETCH_DEADLINE_MS),
  );

  return outcome.kind === "failed"
    ? { kind: "failed", fetched: { status: loggedFailureOf(outcome) } }
    : { kind: "resolved", address: outcome.url };
}
