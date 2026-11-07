import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import { z } from "zod";

import { collapsed } from "./format.ts";

export const ArticleReadingSchema = z.object({
  title: z.string(),
  author: z.string().nullable(),
  words: z.number(),
  postText: z.string(),
  postedAt: z.number().nullable(),
});

export type ArticleReading = z.infer<typeof ArticleReadingSchema>;

const PublishedSchema = z.union([
  z.iso.datetime({ offset: true }).transform((value) => Date.parse(value)),
  z.iso.date().transform((value) => Date.parse(`${value}T00:00:00Z`)),
]);

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

export async function readArticle(html: string, url: string): Promise<ArticleReading> {
  const { document } = parseHTML(html);
  const pageTitle = titleIn(document);

  for (const media of document.querySelectorAll("video, audio, iframe")) {
    media.remove();
  }

  const result = await Defuddle(document, url, {
    markdown: true,
    useAsync: false,
    fetch: refuseRequests,
  });

  const postText = result.content.trim();
  const author = result.author.trim();

  return {
    title: pageTitle === "" ? collapsed(result.title) : pageTitle,
    author: author === "" ? null : author,
    words: result.wordCount,
    postText,
    postedAt: postedAtOf(result.published),
  };
}
