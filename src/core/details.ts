import type { ArticleReading } from "./article.ts";
import type { Page } from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { collapsed } from "./format.ts";
import { type Link, isGitHubLink, isVideoLink, parseLink, redditRefOf } from "./links.ts";
import type { MarkdownImage } from "./markdown-images.ts";
import type { PageReader } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import type { SuppliedPage } from "./supplied-page.ts";

export interface Repository {
  readonly description: string | null;
  readonly stars: number;
  readonly language: string | null;
  readonly license: string | null;
  readonly topics: readonly string[];
  readonly pushedAt: number | null;
}

interface PageText {
  readonly postText: string;
  readonly postedAt: number | null;
  readonly videos: readonly string[];
  readonly images: readonly MarkdownImage[];
  readonly url: string;
}

export type Content =
  | ({ readonly kind: "article" } & PageText)
  | ({ readonly kind: "page" } & PageText)
  | { readonly kind: "empty-page" }
  | { readonly kind: "thread"; readonly thread: ParsedThread; readonly archivedAt: number }
  | {
      readonly kind: "github-repo";
      readonly repository: Repository;
      readonly readme: string | null;
    }
  | { readonly kind: "link" };

export interface Found {
  readonly title: string;
  readonly author: string | null;
  readonly community: string | null;
  readonly content: Content | null;
}

export type Concluded =
  | { readonly status: "ok"; readonly found: Found }
  | { readonly status: FetchFailure | "not-requested" };

export type Fetched =
  | Concluded
  | { readonly status: "waiting"; readonly until: number; readonly limited: boolean };

export const NOT_REQUESTED: Concluded = { status: "not-requested" };

export const MIN_ARTICLE_WORDS = 100;

const NOT_AN_ARTICLE: Content = { kind: "link" };

const EMPTY_PAGE: Content = { kind: "empty-page" };

function isArticleAddress(url: string): boolean {
  return !isVideoLink(url) && !isGitHubLink(url);
}

function isArticleCandidate(page: Readonly<Page>): boolean {
  return page.html && !page.cut && isArticleAddress(page.url);
}

function titled(title: string, found: Readonly<Pick<Found, "author" | "content">>): Concluded {
  return title === ""
    ? { status: "no-title" }
    : { status: "ok", found: { title, community: null, ...found } };
}

function articleDetails(
  { title, author, words, postText, postedAt, videos, images }: Readonly<ArticleReading>,
  url: string,
): Concluded {
  return titled(
    title,
    words < MIN_ARTICLE_WORDS
      ? { author: null, content: NOT_AN_ARTICLE }
      : { author, content: { kind: "article", postText, postedAt, videos, images, url } },
  );
}

function redditPageDetails(
  { title, author, words, postText, postedAt, videos, images }: Readonly<ArticleReading>,
  url: string,
): Concluded {
  if (title === "") return { status: "no-title" };

  return {
    status: "ok",
    found: {
      title,
      author,
      community: redditRefOf(url)?.community ?? null,
      content:
        words < MIN_ARTICLE_WORDS
          ? EMPTY_PAGE
          : { kind: "page", postText, postedAt, videos, images, url },
    },
  };
}

export async function detailsOfSuppliedPage(
  pages: Readonly<PageReader>,
  page: SuppliedPage,
  url: string,
  deadline: AbortSignal,
): Promise<Concluded> {
  const { kind } = parseLink(url);

  if (kind === "reddit-post" || kind === "reddit-comment") {
    return redditPageDetails(await pages.page(page, deadline), url);
  }

  if (!isArticleAddress(url)) {
    return titled(collapsed(page.title), { author: null, content: NOT_AN_ARTICLE });
  }

  return articleDetails(await pages.page(page, deadline), url);
}

export async function detailsOfPage(
  pages: Readonly<PageReader>,
  page: Readonly<Page>,
  link: Readonly<Link>,
  deadline: AbortSignal,
): Promise<Concluded> {
  if (link.kind !== "link") {
    return titled(await pages.title(page.text, deadline), { author: null, content: null });
  }

  if (!isArticleCandidate(page)) {
    return titled(await pages.title(page.text, deadline), {
      author: null,
      content: NOT_AN_ARTICLE,
    });
  }

  return articleDetails(await pages.article(page.text, page.url, deadline), page.url);
}
