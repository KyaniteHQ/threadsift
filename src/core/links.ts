import { isRefusedHost, withoutTrailingDot } from "./addresses.ts";
import { GITHUB_NON_OWNER_PATHS } from "./github-owners.ts";
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

const GITHUB_NAME = /^[\w.-]+$/u;
export const GIT_SUFFIX = /(?<=.)\.git$/iu;
const X_STATUS_PATH = /^\/(?:[^/]+|i\/web)\/status\/(\d+)(?:\/|$)/u;
const LEADING_ZEROS = /^0+(?=\d)/u;
const REDDIT_PATH_PREFIXES: ReadonlySet<string> = new Set(["r", "user", "u"]);
const REDDIT_ID = /^[a-zA-Z\d]+$/u;

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

export function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment !== "");
}

export interface RedditRef {
  readonly postId: string;
  readonly commentId: string | undefined;
}

function isRedditHost(host: string): boolean {
  return host === "reddit.com" || host.endsWith(".reddit.com");
}

function isRedditId(id: string | undefined): id is string {
  return id !== undefined && REDDIT_ID.test(id);
}

function redditRef(host: string, segments: readonly string[]): RedditRef | null {
  if (host === "redd.it") {
    const [postId] = segments;

    return segments.length === 1 && isRedditId(postId)
      ? { postId: postId.toLowerCase(), commentId: undefined }
      : null;
  }

  const at = segments.indexOf("comments");
  const prefix = segments[0] ?? "";
  const hasPrefix = at === 2 && REDDIT_PATH_PREFIXES.has(prefix);
  const postId = segments[at + 1];
  const commentId = segments[at + 3];

  if (
    !isRedditHost(host) ||
    !(at === 0 || hasPrefix) ||
    !isRedditId(postId) ||
    (commentId !== undefined && !isRedditId(commentId))
  ) {
    return null;
  }

  return { postId: postId.toLowerCase(), commentId: commentId?.toLowerCase() };
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

function xLink(statusId: string): Link {
  return {
    normalizedUrl: `https://x.com/i/status/${statusId.replace(LEADING_ZEROS, "")}`,
    kind: "x-post",
    source: "x",
  };
}

function repositoryRootPath([owner = "", repo = ""]: readonly string[]): string {
  return `/${owner}/${repo.replace(GIT_SUFFIX, "")}`.toLowerCase();
}

export function parseLink(absoluteUrl: string): Link {
  const url = new URL(absoluteUrl);
  const host = canonicalHost(url.hostname);
  url.hostname = host;
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = keptQuery(url.search, host);
  const segments = segmentsOf(url.pathname);
  const reddit = redditRef(host, segments);

  if (reddit !== null) {
    return redditLink(reddit);
  }

  const statusId = X_HOSTS.has(host) ? X_STATUS_PATH.exec(url.pathname)?.[1] : undefined;

  if (statusId !== undefined) {
    return xLink(statusId);
  }

  const kind = host === GITHUB_HOST ? githubKind(segments) : "link";

  if (kind === "github-repo" && segments.length === 2) {
    url.pathname = repositoryRootPath(segments);
  }

  return { normalizedUrl: url.href, kind, source: SOURCE_OF_KIND[kind] };
}

export function redditRefOf(absoluteUrl: string): RedditRef | null {
  const { hostname, pathname } = new URL(absoluteUrl);

  return redditRef(canonicalHost(hostname), segmentsOf(pathname));
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

export function spellingOf({
  normalizedUrl,
  originalUrl,
}: Readonly<Pick<LinkPlace, "normalizedUrl" | "originalUrl">>): string {
  return URL.canParse(originalUrl) && parseLink(originalUrl).normalizedUrl === normalizedUrl
    ? originalUrl
    : normalizedUrl;
}

export function whereOf({
  source,
  kind,
  normalizedUrl,
  originalUrl,
  community,
}: Readonly<LinkPlace>): string {
  const { host } = new URL(normalizedUrl);

  const [first = "", second = ""] = segmentsOf(
    new URL(spellingOf({ normalizedUrl, originalUrl })).pathname,
  );

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
    return `${first}/${second.replace(GIT_SUFFIX, "")}`;
  }

  return host;
}

const SCHEME_AND_WWW = /^https?:\/\/(?:www\.)?/u;

export function shownUrl(url: string): string {
  return url.replace(SCHEME_AND_WWW, "");
}
