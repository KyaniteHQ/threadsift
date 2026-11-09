import { parseHTML } from "linkedom";
import { z } from "zod";

import type { ArticleReading } from "./article.ts";
import type { Page } from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { collapsed } from "./format.ts";
import { type Link, isGitHubLink, isVideoLink } from "./links.ts";
import type { MarkdownImage } from "./markdown-images.ts";
import type { PageReader } from "./ports.ts";
import type { SuppliedPage } from "./supplied-page.ts";

export interface Repository {
  readonly description: string | null;
  readonly stars: number;
  readonly language: string | null;
  readonly license: string | null;
  readonly topics: readonly string[];
  readonly pushedAt: number | null;
}

export type Content =
  | {
      readonly kind: "article";
      readonly postText: string;
      readonly postedAt: number | null;
      readonly videos: readonly string[];
      readonly images: readonly MarkdownImage[];
      readonly url: string;
    }
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

const SUBREDDIT_LINK = /^https:\/\/www\.reddit\.com\/r\/(?<name>[^/?#]+)\//u;

const OembedSchema = z.object({
  title: z.string(),
  author_name: z.string().optional(),
  html: z.string().optional(),
});

function parseOembed(text: string): z.infer<typeof OembedSchema> | null {
  try {
    return OembedSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

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

export async function detailsOfSuppliedPage(
  pages: Readonly<PageReader>,
  page: SuppliedPage,
  url: string,
  deadline: AbortSignal,
): Promise<Concluded> {
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

function subredditOf(html: string): string | null {
  const { document } = parseHTML(html);

  for (const anchor of document.querySelectorAll("a[href]")) {
    const name = SUBREDDIT_LINK.exec(anchor.getAttribute("href") ?? "")?.groups?.["name"];

    if (name !== undefined) {
      return name;
    }
  }

  return null;
}

export function detailsOfOembed(text: string): Concluded {
  const answer = parseOembed(text);

  if (answer === null) {
    return { status: "unreadable" };
  }

  const title = collapsed(answer.title);

  if (title === "") {
    return { status: "no-title" };
  }

  return {
    status: "ok",
    found: {
      title,
      author: answer.author_name ?? null,
      community: subredditOf(answer.html ?? ""),
      content: null,
    },
  };
}
