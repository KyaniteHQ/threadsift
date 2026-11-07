import { parseHTML } from "linkedom";
import { z } from "zod";

import type { Page } from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { collapsed } from "./format.ts";
import { type Link, isGitHubLink, isVideoLink } from "./links.ts";
import type { PageReader } from "./ports.ts";

export type Content =
  | { readonly kind: "article"; readonly postText: string; readonly postedAt: number | null }
  | { readonly kind: "link" };

export interface Found {
  readonly title: string;
  readonly author: string | null;
  readonly community: string | null;
  readonly content: Content | null;
}

export type Fetched =
  | { readonly status: "ok"; readonly found: Found }
  | { readonly status: FetchFailure | "not-requested" };

export const NOT_REQUESTED: Fetched = { status: "not-requested" };

const MIN_ARTICLE_WORDS = 100;

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

function isArticleCandidate(page: Readonly<Page>): boolean {
  return page.html && !page.cut && !isVideoLink(page.url) && !isGitHubLink(page.url);
}

function titled(title: string, found: Readonly<Pick<Found, "author" | "content">>): Fetched {
  return title === ""
    ? { status: "no-title" }
    : { status: "ok", found: { title, community: null, ...found } };
}

export async function detailsOfPage(
  pages: Readonly<PageReader>,
  page: Readonly<Page>,
  link: Readonly<Link>,
  deadline: AbortSignal,
): Promise<Fetched> {
  if (link.kind !== "link") {
    return titled(await pages.title(page.text, deadline), { author: null, content: null });
  }

  if (!isArticleCandidate(page)) {
    return titled(await pages.title(page.text, deadline), {
      author: null,
      content: NOT_AN_ARTICLE,
    });
  }

  const { title, author, words, postText, postedAt } = await pages.article(
    page.text,
    page.url,
    deadline,
  );

  return titled(
    title,
    words < MIN_ARTICLE_WORDS
      ? { author: null, content: NOT_AN_ARTICLE }
      : { author, content: { kind: "article", postText, postedAt } },
  );
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

export function detailsOfOembed(text: string): Fetched {
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
