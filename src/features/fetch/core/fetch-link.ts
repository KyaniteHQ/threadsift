import {
  type Link,
  type LinkRoute,
  isRedditOrXLink,
  isRedditShareLink,
  isShortLink,
  parsedLinkOf,
  redditRefOf,
} from "../../../core/contract/links.ts";
import type { SuppliedPage } from "../../../core/contract/supplied-page.ts";
import {
  type FetchPolicy,
  guardedFetch,
  loggedFailureOf,
} from "../../../core/kernel/fetch-guard.ts";
import { SMALL_POLICY, followingShortLinks } from "../../../core/kernel/fetch-policies.ts";
import type { Network } from "../../../core/kernel/network.ts";
import type { PageReader } from "../../../core/kernel/page-reader.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { fetchedOfRepository } from "../../github/core/github-fetch.ts";
import {
  type Concluded,
  type Fetched,
  NOT_REQUESTED,
  detailsOfPage,
  detailsOfSuppliedPage,
  fetchedOf,
  readOrTimeOut,
} from "../../media/core/details.ts";
import { fetchedOfOembed } from "../../reddit/core/oembed-details.ts";

export type ShortLinkResolution =
  | { readonly kind: "resolved"; readonly address: string }
  | { readonly kind: "failed"; readonly fetched: Exclude<Concluded, { status: "ok" }> };

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
      return fetchedOfRepository(ports, attempts, route.link.normalizedUrl, deadline);
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

async function resolvedHop(
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

export async function resolveShortLink(
  network: Network,
  address: string,
  deadline: AbortSignal,
): Promise<ShortLinkResolution> {
  const resolved = await resolvedHop(network, address, deadline);

  return resolved.kind === "resolved" && isRedditShareLink(resolved.address)
    ? resolvedHop(network, resolved.address, deadline)
    : resolved;
}
