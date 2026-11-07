import { isRefusedHost, withoutTrailingDot } from "./addresses.ts";
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
  article: "article",
  link: "other",
};

export function sourceOf(kind: Kind): Source {
  return SOURCE_OF_KIND[kind];
}

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

const GITHUB_HOST = "github.com";

const X_HOSTS: ReadonlySet<string> = new Set(["x.com", "twitter.com"]);

const X_ONLY_TRACKING_PARAMS: ReadonlySet<string> = new Set(["s", "t"]);

const SHORT_LINK_HOSTS: ReadonlySet<string> = new Set([
  "t.co",
  "bit.ly",
  "buff.ly",
  "tinyurl.com",
  "ow.ly",
  "lnkd.in",
  "dlvr.it",
  "is.gd",
]);

const VIDEO_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "vimeo.com",
]);

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
  "education",
  "enterprise",
  "events",
  "explore",
  "features",
  "github-copilot",
  "home",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "mobile",
  "new",
  "nonprofit",
  "notifications",
  "open-source",
  "organizations",
  "orgs",
  "partners",
  "premium-support",
  "pricing",
  "pulls",
  "readme",
  "resources",
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
  "user-attachments",
  "users",
  "watching",
  "why-github",
]);

const GITHUB_NAME = /^[\w.-]+$/u;
const X_POST_PATH = /^\/(?:[^/]+|i\/web)\/status\/\d+(?:\/|$)/u;
const REDDIT_PATH_PREFIXES: ReadonlySet<string> = new Set(["r", "user", "u"]);
const REDDIT_ID = /^[a-z\d]+$/iu;

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

const MOBILE_X_HOST = /^mobile\.(?:x|twitter)\.com$/u;

function canonicalHost(rawHost: string): string {
  const host = withoutTrailingDot(rawHost);
  const desktop = MOBILE_X_HOST.test(host) ? host.slice("mobile.".length) : host;
  const bare = desktop.startsWith("www.") ? desktop.slice("www.".length) : desktop;

  return bare.includes(".") ? bare : desktop;
}

function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment !== "");
}

interface RedditRef {
  readonly postId: string;
  readonly commentId: string | undefined;
}

function isRedditHost(host: string): boolean {
  return host === "reddit.com" || host.endsWith(".reddit.com");
}

function redditRef(host: string, segments: readonly string[]): RedditRef | null {
  if (host === "redd.it") {
    const [postId] = segments;

    return segments.length === 1 && postId !== undefined && REDDIT_ID.test(postId)
      ? { postId, commentId: undefined }
      : null;
  }

  const at = segments.indexOf("comments");
  const prefix = segments[0] ?? "";
  const hasPrefix = at === 2 && REDDIT_PATH_PREFIXES.has(prefix);
  const postId = segments[at + 1];

  if (!isRedditHost(host) || !(at === 0 || hasPrefix) || postId === undefined) {
    return null;
  }

  return { postId, commentId: segments[at + 3] };
}

function redditLink({ postId, commentId }: Readonly<RedditRef>): Link {
  const post = `https://reddit.com/r/all/comments/${postId}/`;
  const kind = commentId === undefined ? "reddit-post" : "reddit-comment";
  const normalizedUrl = commentId === undefined ? post : `${post}_/${commentId}/`;

  return { normalizedUrl, kind, source: SOURCE_OF_KIND[kind] };
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
  const segments = segmentsOf(pathname);

  if (X_HOSTS.has(host)) {
    return X_POST_PATH.test(pathname) ? "x-post" : "link";
  }

  return host === GITHUB_HOST ? githubKind(segments) : "link";
}

export function parseLink(absoluteUrl: string): Link {
  const url = new URL(absoluteUrl);
  const host = canonicalHost(url.hostname);
  url.hostname = host;
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = keptQuery(url.search, host);
  const reddit = redditRef(host, segmentsOf(url.pathname));

  if (reddit !== null) {
    return redditLink(reddit);
  }

  const kind = kindOf(host, url.pathname);

  return { normalizedUrl: url.href, kind, source: SOURCE_OF_KIND[kind] };
}

function hostOf(absoluteUrl: string): string {
  return canonicalHost(new URL(absoluteUrl).hostname);
}

export function isRefusedLink(absoluteUrl: string): boolean {
  return isRefusedHost(new URL(absoluteUrl).hostname);
}

export function isShortLink(absoluteUrl: string): boolean {
  return SHORT_LINK_HOSTS.has(hostOf(absoluteUrl));
}

export function isGitHubLink(absoluteUrl: string): boolean {
  return hostOf(absoluteUrl) === GITHUB_HOST;
}

export function isVideoLink(absoluteUrl: string): boolean {
  return VIDEO_HOSTS.has(hostOf(absoluteUrl));
}

export function isRedditOrXLink(absoluteUrl: string): boolean {
  const host = hostOf(absoluteUrl);

  return host === "redd.it" || isRedditHost(host) || X_HOSTS.has(host);
}

interface LinkPlace extends Link {
  readonly originalUrl: string;
  readonly community: string | null;
}

export function whereOf({
  source,
  kind,
  normalizedUrl,
  originalUrl,
  community,
}: Readonly<LinkPlace>): string {
  const { host, pathname } = new URL(normalizedUrl);
  const [first = "", second = ""] = segmentsOf(pathname);

  if (community !== null) {
    return `r/${community}`;
  }

  if (source === "reddit") {
    const [pastedFirst = "", pastedSecond = ""] = segmentsOf(new URL(originalUrl).pathname);

    if (pastedSecond !== "" && REDDIT_PATH_PREFIXES.has(pastedFirst)) {
      return pastedFirst === "r" ? `r/${pastedSecond}` : `u/${pastedSecond}`;
    }
  }

  if (kind === "x-post" && first !== "i") {
    return `@${first}`;
  }

  if (kind === "github-repo") {
    return `${first}/${second}`;
  }

  return host;
}

const SCHEME_AND_WWW = /^https?:\/\/(?:www\.)?/u;

export function shownUrl(url: string): string {
  return url.replace(SCHEME_AND_WWW, "");
}
