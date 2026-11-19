import {
  type Concluded,
  type Fetched,
  NOT_REQUESTED,
  detailsOfPage,
  detailsOfSuppliedPage,
} from "./details.ts";
import {
  type BodyUse,
  type FetchPolicy,
  type GuardOutcome,
  type Page,
  guardedFetch,
  loggedFailureOf,
} from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { withCurrentCredential } from "./github-credential.ts";
import { fetchedOfRepository } from "./github-fetch.ts";
import {
  type Link,
  type RedditRef,
  isRedditOrXLink,
  isRedditShareLink,
  isShortLink,
  parsedLinkOf,
  redditRefOf,
} from "./links.ts";
import type { Network } from "./network.ts";
import { detailsOfOembed } from "./oembed-details.ts";
import { PageReadTimeout } from "./page-read-timeout.ts";
import type { PageReader } from "./page-reader.ts";
import type { Ports } from "./ports.ts";
import { repositoryRef } from "./repository-ref.ts";
import type { SuppliedPage } from "./supplied-page.ts";

type ShortLinkResolution =
  | { readonly kind: "resolved"; readonly address: string }
  | { readonly kind: "failed"; readonly fetched: Exclude<Concluded, { status: "ok" }> };

export type LinkRoute =
  | { readonly kind: "reddit"; readonly link: Link; readonly ref: RedditRef }
  | { readonly kind: "x" }
  | { readonly kind: "unrequested" }
  | { readonly kind: "github"; readonly link: Link }
  | { readonly kind: "page"; readonly link: Link };

const followingShortLinks =
  (others: BodyUse) =>
  (url: string): BodyUse =>
    isShortLink(url) ? "follow-refresh" : others;

const SMALL_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  body: followingShortLinks("read"),
};

const RESOLVE_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  body: followingShortLinks("skip"),
};

const SHARE_LINK_POLICY: FetchPolicy = {
  stopAt: () => true,
  body: (url) => (isShortLink(url) ? "read" : "skip"),
};

const NOT_A_POST_OR_COMMENT: ShortLinkResolution = {
  kind: "failed",
  fetched: { status: "unresolved" },
};

export function linkRouteOf(address: string): LinkRoute {
  const { link, reddit } = parsedLinkOf(address);

  if (reddit !== null) return { kind: "reddit", link, ref: reddit };

  if (link.kind === "x-post") return { kind: "x" };

  if (isRedditOrXLink(address)) return { kind: "unrequested" };

  if (link.kind === "github-repo") return { kind: "github", link };

  return { kind: "page", link };
}

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

export async function fetchedOfOembed(
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

async function fetchedOfPage(
  { network, pages }: Readonly<Pick<Ports, "network" | "pages">>,
  address: string,
  link: Readonly<Link>,
  deadline: AbortSignal,
): Promise<Concluded> {
  return fetchedOf(
    await guardedFetch(network, address, pagePolicy(pages), deadline),
    (page) => detailsOfPage(pages, page, link, deadline),
    "redirect-stopped",
  );
}

export function suppliedDetails(
  pages: Readonly<PageReader>,
  page: SuppliedPage,
  address: string,
  deadline: AbortSignal,
): Promise<Concluded> {
  return readOrTimeOut(() => detailsOfSuppliedPage(pages, page, address, deadline));
}

export function fetchedOfRoute(
  ports: Readonly<Pick<Ports, "db" | "secrets" | "network" | "pages">>,
  route: Readonly<LinkRoute>,
  address: string,
  attempts: number,
  deadline: AbortSignal,
): Promise<Fetched> {
  switch (route.kind) {
    case "reddit":
      return fetchedOfOembed(ports.network, route.link.normalizedUrl, deadline);
    case "x":
    case "unrequested":
      return Promise.resolve(NOT_REQUESTED);
    case "github":
      return withCurrentCredential(ports, (auth) =>
        fetchedOfRepository(
          { ports, attempts, auth },
          repositoryRef(route.link.normalizedUrl),
          deadline,
        ),
      );
    case "page":
      return fetchedOfPage(ports, address, route.link, deadline);
    default: {
      const exhaustive: never = route;

      return exhaustive;
    }
  }
}

export function fetchLink(
  ports: Readonly<Pick<Ports, "db" | "secrets" | "network" | "pages">>,
  address: string,
  attempts: number,
  deadline: AbortSignal,
): Promise<Fetched> {
  return new Promise((resolve) => {
    resolve(fetchedOfRoute(ports, linkRouteOf(address), address, attempts, deadline));
  });
}

export async function resolveShortLink(
  network: Network,
  address: string,
  deadline: AbortSignal,
): Promise<ShortLinkResolution> {
  const shareLink = isRedditShareLink(address);

  const outcome = await guardedFetch(
    network,
    address,
    shareLink ? SHARE_LINK_POLICY : RESOLVE_POLICY,
    deadline,
  );

  if (outcome.kind === "failed") {
    return { kind: "failed", fetched: { status: loggedFailureOf(outcome) } };
  }

  return shareLink && redditRefOf(outcome.url) === null
    ? NOT_A_POST_OR_COMMENT
    : { kind: "resolved", address: outcome.url };
}
