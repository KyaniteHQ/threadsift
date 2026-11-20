import {
  type Link,
  REDDIT_PATH_PREFIXES,
  parseLink,
  segmentsOf,
  withoutGitSuffix,
} from "./links.ts";

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
    return `${first}/${withoutGitSuffix(second)}`;
  }

  return host;
}

const SCHEME_AND_WWW = /^https?:\/\/(?:www\.)?/u;

export function shownUrl(url: string): string {
  return url.replace(SCHEME_AND_WWW, "");
}
