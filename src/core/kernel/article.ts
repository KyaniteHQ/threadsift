import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import { z } from "zod";

import type { EmbedLink } from "../contract/article-embed-links.ts";
import { baseOf, replaceMedia, retainedVideos } from "../contract/article-media.ts";
import { collapsed } from "../contract/format.ts";
import { MIN_ARTICLE_WORDS } from "../contract/limits.ts";
import type { SuppliedPage } from "../contract/supplied-page.ts";
import { projectText } from "../contract/text-projection.ts";
import { MarkdownImageSchema, NOTHING_SCANNED, scanMarkdown } from "./markdown-images.ts";

const ArticleReadingSchema = z.object({
  title: z.string(),
  author: z.string().nullable(),
  words: z.number(),
  postText: z.string(),
  postedAt: z.number().nullable(),
  videos: z.array(z.string()).readonly(),
  images: z.array(MarkdownImageSchema).readonly(),
});

export type ArticleReading = z.infer<typeof ArticleReadingSchema>;

const PublishedSchema = z.union([
  z.iso.datetime({ offset: true }).transform((value) => Date.parse(value)),
  z.iso.date().transform((value) => Date.parse(`${value}T00:00:00Z`)),
]);

const CJK_SCRIPTS = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}";

const WORDS = new RegExp(`[${CJK_SCRIPTS}]|[^\\s${CJK_SCRIPTS}]+`, "gu");

const refuseRequests: typeof globalThis.fetch = () =>
  Promise.reject(new Error("an extractor may not make requests"));

function postedAtOf(published: string): number | null {
  const parsed = PublishedSchema.safeParse(published);

  return parsed.success ? parsed.data : null;
}

function titleIn(document: Document): string {
  const element = [...document.querySelectorAll("title")].find(
    (each) => each.closest("svg") === null,
  );

  return collapsed(element?.textContent ?? "");
}

export function readTitle(html: string): string {
  return titleIn(parseHTML(html).document);
}

interface Parts {
  readonly title: string;
  readonly author: string;
  readonly postText: string;
  readonly words: number;
  readonly postedAt: number | null;
  readonly linked: readonly EmbedLink[];
}

function assembled({
  title,
  author,
  postText,
  words,
  postedAt,
  linked,
}: Readonly<Parts>): ArticleReading {
  const isArticle = words >= MIN_ARTICLE_WORDS;
  const wantsLinks = linked.some(({ video }) => video);
  const scan = isArticle ? scanMarkdown(postText, wantsLinks) : NOTHING_SCANNED;
  const trimmedAuthor = author.trim();

  return {
    title,
    author: trimmedAuthor === "" ? null : trimmedAuthor,
    words,
    postText,
    postedAt,
    videos: retainedVideos(linked, scan.links),
    images: scan.images,
  };
}

export async function readArticle(html: string, url: string): Promise<ArticleReading> {
  const { document } = parseHTML(html);
  const pageTitle = titleIn(document);
  const linked = replaceMedia(document, baseOf(document, url));

  const result = await Defuddle(document, url, {
    separateMarkdown: true,
    useAsync: false,
    fetch: refuseRequests,
  });

  return assembled({
    title: pageTitle === "" ? collapsed(result.title) : pageTitle,
    author: result.author,
    postText: (result.contentMarkdown ?? "").trim(),
    words: result.wordCount,
    postedAt: postedAtOf(result.published),
    linked,
  });
}

function wordsIn(text: string): number {
  return text.match(WORDS)?.length ?? 0;
}

export function readSuppliedPage(page: SuppliedPage): ArticleReading {
  const linked = (page.videos ?? []).flatMap((video) => {
    const url = URL.parse(video)?.href;

    return url === undefined ? [] : [{ url, video: true }];
  });

  const postText = page.markdown.trim();

  return assembled({
    title: collapsed(page.title),
    author: page.author ?? "",
    postText,
    words: wordsIn(projectText(postText)),
    postedAt: postedAtOf(page.published ?? ""),
    linked,
  });
}
