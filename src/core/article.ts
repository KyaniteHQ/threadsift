import type { DefuddleResponse } from "defuddle";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";

import { collapsed } from "./format.ts";

const MAX_TEXT_BYTES = 1_000_000;
const PARTIAL_CONVERSION = "Partial conversion completed with errors.";
const ISO_DATE_START = /^\d{4}-\d{2}-\d{2}/u;
const ENCODER = new TextEncoder();

const CODE_OR_RAW_MEDIA =
  /(?:^(?<fence>`{3,}|~{3,})[^\n]*\n[\s\S]*?^\k<fence>[ \t]*$|`[^`\n]*`)|<(?<tag>video|audio|iframe)\b[^>]*>[\s\S]*?<\/\k<tag>>/gimu;

export interface Extraction {
  readonly title: string;
  readonly author: string | null;
  readonly words: number;
  readonly postText: string | null;
  readonly postedAt: number | null;
}

function withoutRawMedia(markdown: string): string {
  return markdown.replaceAll(CODE_OR_RAW_MEDIA, (match) => (match.startsWith("<") ? "" : match));
}

function postedAtOf(published: string): number | null {
  const time = ISO_DATE_START.test(published) ? Date.parse(published) : Number.NaN;

  return Number.isNaN(time) ? null : time;
}

export interface Reading {
  readonly title: string;
  readonly extraction: Extraction | null;
}

export type ReadingMode = "title" | "article";

type Parsed = Readonly<
  Pick<DefuddleResponse, "title" | "author" | "wordCount" | "content" | "published">
>;

function extractionOf(result: Parsed): Extraction {
  if (result.content.startsWith(PARTIAL_CONVERSION)) {
    throw new Error("Defuddle could not convert the page to Markdown");
  }

  const postText = withoutRawMedia(result.content).trim();
  const author = result.author.trim();

  return {
    title: collapsed(result.title),
    author: author === "" ? null : author,
    words: result.wordCount,
    postText: ENCODER.encode(postText).length > MAX_TEXT_BYTES ? null : postText,
    postedAt: postedAtOf(result.published),
  };
}

export async function readPage(html: string, url: string, mode: ReadingMode): Promise<Reading> {
  const { document } = parseHTML(html);

  const element = [...document.querySelectorAll("title")].find(
    (each) => each.closest("svg") === null,
  );

  const title = collapsed(element?.textContent ?? "");

  if (mode === "title") {
    return { title, extraction: null };
  }

  const parsed = await Defuddle(document, url, { markdown: true, useAsync: false });

  return { title, extraction: extractionOf(parsed) };
}
