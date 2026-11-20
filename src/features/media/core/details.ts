import type { FetchFailure } from "../../../core/contract/fetch-results.ts";
import { collapsed } from "../../../core/contract/format.ts";
import type { WaitReason } from "../../../core/contract/job-contract.ts";
import { MIN_ARTICLE_WORDS } from "../../../core/contract/limits.ts";
import {
  type Link,
  isGitHubLink,
  isVideoLink,
  parseLink,
  redditRefOf,
} from "../../../core/contract/links.ts";
import type { SuppliedPage } from "../../../core/contract/supplied-page.ts";
import type { XReadNote } from "../../../core/contract/x-read-note.ts";
import type { ArticleReading } from "../../../core/kernel/article.ts";
import { type GuardOutcome, type Page, loggedFailureOf } from "../../../core/kernel/fetch-guard.ts";
import type { MarkdownImage } from "../../../core/kernel/markdown-images.ts";
import { PageReadTimeout } from "../../../core/kernel/page-read-timeout.ts";
import type { PageReader } from "../../../core/kernel/page-reader.ts";
import type { StoredThread } from "../../thread/core/stored-thread.ts";

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
  | { readonly kind: "thread"; readonly thread: StoredThread; readonly archivedAt: number | null }
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

export type Concluded = (
  | { readonly status: "ok"; readonly found: Found }
  | { readonly status: FetchFailure | "not-requested" }
) & { readonly note?: XReadNote };

export type Fetched =
  | Concluded
  | {
      readonly status: "waiting";
      readonly until: number;
      readonly limited: boolean;
      readonly wait: WaitReason;
    };

export const NOT_REQUESTED: Concluded = { status: "not-requested" };

const NOT_AN_ARTICLE: Content = { kind: "link" };

const EMPTY_PAGE: Content = { kind: "empty-page" };

const NO_BYLINE = { author: null, community: null } as const;

function isArticleAddress(url: string): boolean {
  return !isVideoLink(url) && !isGitHubLink(url);
}

function isArticleCandidate(page: Readonly<Page>): boolean {
  return page.html && !page.cut && isArticleAddress(page.url);
}

function titled(title: string, found: Readonly<Omit<Found, "title">>): Concluded {
  return title === "" ? { status: "no-title" } : { status: "ok", found: { title, ...found } };
}

function articleDetails(
  { title, author, words, postText, postedAt, videos, images }: Readonly<ArticleReading>,
  url: string,
): Concluded {
  return titled(
    title,
    words < MIN_ARTICLE_WORDS
      ? { ...NO_BYLINE, content: NOT_AN_ARTICLE }
      : {
          author,
          community: null,
          content: { kind: "article", postText, postedAt, videos, images, url },
        },
  );
}

function redditPageDetails(
  { title, author, words, postText, postedAt, videos, images }: Readonly<ArticleReading>,
  url: string,
): Concluded {
  return titled(title, {
    author,
    community: redditRefOf(url)?.community ?? null,
    content:
      words < MIN_ARTICLE_WORDS
        ? EMPTY_PAGE
        : { kind: "page", postText, postedAt, videos, images, url },
  });
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
    return titled(collapsed(page.title), {
      ...NO_BYLINE,
      content: NOT_AN_ARTICLE,
    });
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
    return titled(await pages.title(page.text, deadline), {
      ...NO_BYLINE,
      content: null,
    });
  }

  if (!isArticleCandidate(page)) {
    return titled(await pages.title(page.text, deadline), {
      ...NO_BYLINE,
      content: NOT_AN_ARTICLE,
    });
  }

  return articleDetails(await pages.article(page.text, page.url, deadline), page.url);
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

export function fetchedOf(
  outcome: Readonly<GuardOutcome>,
  readPage: (page: Readonly<Page>) => Promise<Concluded> | Concluded,
  whenStopped: FetchFailure,
): Promise<Concluded> {
  if (outcome.kind !== "page") {
    return Promise.resolve({ status: loggedFailureOf(outcome, whenStopped) });
  }

  return readOrTimeOut(() => readPage(outcome));
}
