import type { Kind, Source } from "./kinds.ts";

export interface Link {
  readonly normalizedUrl: string;
  readonly kind: Kind;
  readonly source: Source;
}

const SOURCE_OF_KIND: Readonly<Record<Kind, Source>> = {
  "reddit-post": "reddit",
  "reddit-comment": "reddit",
  "x-post": "x",
  "github-repo": "github",
  link: "other",
};

const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref_src",
]);

const X_HOSTS: ReadonlySet<string> = new Set(["x.com", "twitter.com"]);
const X_ONLY_TRACKING_PARAMS: ReadonlySet<string> = new Set(["s", "t"]);

const GITHUB_NON_OWNER_PATHS: ReadonlySet<string> = new Set([
  "about",
  "account",
  "apps",
  "codespaces",
  "collections",
  "contact",
  "copilot",
  "customer-stories",
  "dashboard",
  "discussions",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "sessions",
  "settings",
  "signup",
  "site",
  "solutions",
  "sponsors",
  "stars",
  "support",
  "team",
  "teams",
  "topics",
  "trending",
  "users",
  "watching",
  "why-github",
]);

const GITHUB_NAME = /^[\w.-]+$/u;
const X_POST_PATH = /^\/(?:[^/]+|i\/web)\/status\/\d+(?:\/|$)/u;
const REDDIT_PATH_PREFIXES: ReadonlySet<string> = new Set(["r", "user", "u"]);

function isTrackingParam(pair: string, host: string): boolean {
  const key = (new URLSearchParams(pair).keys().next().value ?? "").toLowerCase();

  return (
    key.startsWith("utm_") ||
    TRACKING_PARAMS.has(key) ||
    (X_HOSTS.has(host) && X_ONLY_TRACKING_PARAMS.has(key))
  );
}

function keptQuery(search: string, host: string): string {
  const kept = search
    .slice(1)
    .split("&")
    .filter((pair) => pair !== "" && !isTrackingParam(pair, host));

  return kept.length > 0 ? `?${kept.join("&")}` : "";
}

function withoutWww(host: string): string {
  const bare = host.startsWith("www.") ? host.slice("www.".length) : host;

  return bare.includes(".") ? bare : host;
}

function redditKind(segments: readonly string[]): Kind | null {
  const at = segments.indexOf("comments");
  const prefix = segments[0] ?? "";
  const hasPrefix = at === 2 && REDDIT_PATH_PREFIXES.has(prefix);

  if (!(at === 0 || hasPrefix) || segments[at + 1] === undefined) {
    return null;
  }

  return segments[at + 3] === undefined ? "reddit-post" : "reddit-comment";
}

function githubKind(segments: readonly string[]): Kind {
  const [owner = "", repo = ""] = segments;

  const isRepository =
    GITHUB_NAME.test(owner) &&
    GITHUB_NAME.test(repo) &&
    !GITHUB_NON_OWNER_PATHS.has(owner.toLowerCase());

  return isRepository ? "github-repo" : "link";
}

function kindOf(host: string, pathname: string): Kind {
  const segments = pathname.split("/").filter((segment) => segment !== "");

  if (host === "reddit.com" || host.endsWith(".reddit.com")) {
    return redditKind(segments) ?? "link";
  }

  if (X_HOSTS.has(host)) {
    return X_POST_PATH.test(pathname) ? "x-post" : "link";
  }

  return host === "github.com" ? githubKind(segments) : "link";
}

export function parseLink(absoluteUrl: string): Link {
  const url = new URL(absoluteUrl);
  const host = withoutWww(url.hostname);
  url.hostname = host;
  url.hash = "";
  url.search = keptQuery(url.search, host);
  const kind = kindOf(host, url.pathname);

  return { normalizedUrl: url.href, kind, source: SOURCE_OF_KIND[kind] };
}
