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

export const X_HOSTS: ReadonlySet<string> = new Set(["x.com", "twitter.com"]);

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
const GIT_SUFFIX = ".git";
const X_STATUS_PATH = /^\/(?:[^/]+|i\/web)\/status\/(\d+)(?:\/|$)/u;
const LEADING_ZEROS = /^0+(?=\d)/u;
export const REDDIT_PATH_PREFIXES: ReadonlySet<string> = new Set(["r", "user", "u"]);
const REDDIT_ID = /^[a-zA-Z\d]+$/u;
const REDDIT_SHARE_PATH = /^\/r\/[^/]+\/s\/[a-zA-Z\d]+\/?$/u;

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

const MOBILE_X_REST: ReadonlySet<string> = new Set(["x.com", "twitter.com"]);

const WWW_MIN_REST_LABELS = 2;

function startsAfterArtifact(labels: readonly string[], first: number): number {
  const rest = labels.slice(first + 1);

  const isWww = labels[first] === "www" && rest.length >= WWW_MIN_REST_LABELS;
  const isMobile = labels[first] === "mobile" && MOBILE_X_REST.has(rest.join("."));

  return isWww || isMobile ? first + 1 : first;
}

function canonicalHost(rawHost: string): string {
  const labels = withoutTrailingDot(rawHost).split(".");
  let first = 0;
  let next = startsAfterArtifact(labels, first);

  while (next !== first) {
    first = next;
    next = startsAfterArtifact(labels, first);
  }

  return labels.slice(first).join(".");
}

export function withoutGitSuffix(name: string): string {
  let end = name.length;

  while (
    end > GIT_SUFFIX.length &&
    name.slice(end - GIT_SUFFIX.length, end).toLowerCase() === GIT_SUFFIX
  ) {
    end -= GIT_SUFFIX.length;
  }

  return name.slice(0, end);
}

export function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment !== "");
}

export interface RedditRef {
  readonly postId: string;
  readonly commentId: string | undefined;
  readonly community: string | undefined;
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
      ? { postId: postId.toLowerCase(), commentId: undefined, community: undefined }
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

  return {
    postId: postId.toLowerCase(),
    commentId: commentId?.toLowerCase(),
    community: hasPrefix && prefix === "r" ? segments[1] : undefined,
  };
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

function statusIdIn(host: string, pathname: string): string | null {
  const digits = X_HOSTS.has(host) ? X_STATUS_PATH.exec(pathname)?.[1] : undefined;

  return digits === undefined ? null : digits.replace(LEADING_ZEROS, "");
}

export function statusIdOf(absoluteUrl: string): string | null {
  const { hostname, pathname } = new URL(absoluteUrl);

  return statusIdIn(canonicalHost(hostname), pathname);
}

function xLink(statusId: string): Link {
  return {
    normalizedUrl: `https://x.com/i/status/${statusId}`,
    kind: "x-post",
    source: "x",
  };
}

function repositoryRootPath([owner = "", repo = ""]: readonly string[]): string {
  return `/${owner}/${withoutGitSuffix(repo)}`.toLowerCase();
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

  const statusId = statusIdIn(host, url.pathname);

  if (statusId !== null) {
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

export function hostOf(absoluteUrl: string): string {
  return canonicalHost(new URL(absoluteUrl).hostname);
}

export function isRefusedLink(absoluteUrl: string): boolean {
  return isRefusedHost(new URL(absoluteUrl).hostname);
}

export function isShortLink(absoluteUrl: string): boolean {
  return SHORT_LINK_HOSTS.has(hostOf(absoluteUrl));
}

export function isRedditShareLink(absoluteUrl: string): boolean {
  return (
    hostOf(absoluteUrl) === "reddit.com" && REDDIT_SHARE_PATH.test(new URL(absoluteUrl).pathname)
  );
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

export function takesPage(absoluteUrl: string): boolean {
  return (
    redditRefOf(absoluteUrl) !== null ||
    !(isRedditOrXLink(absoluteUrl) || isGitHubLink(absoluteUrl))
  );
}
