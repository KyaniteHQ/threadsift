import { Defuddle } from "defuddle/node";

import { collapsed } from "./format.ts";

const MAX_TEXT_BYTES = 1_000_000;
const ISO_DATE_START = /^\d{4}-\d{2}-\d{2}/u;
const ENCODER = new TextEncoder();

export interface Extraction {
  readonly title: string;
  readonly author: string | null;
  readonly words: number;
  readonly postText: string | null;
  readonly postedAt: number | null;
}

function postedAtOf(published: string): number | null {
  const time = ISO_DATE_START.test(published) ? Date.parse(published) : Number.NaN;

  return Number.isNaN(time) ? null : time;
}

export function titleOf(document: Document): string {
  const element = [...document.querySelectorAll("title")].find(
    (each) => each.closest("svg") === null,
  );

  return collapsed(element?.textContent ?? "");
}

export async function extractArticle(document: Document, url: string): Promise<Extraction> {
  const pageTitle = titleOf(document);

  for (const media of document.querySelectorAll("video, audio, iframe")) {
    media.remove();
  }

  const result = await Defuddle(document, url, { markdown: true, useAsync: false });
  const postText = result.content.trim();
  const author = result.author.trim();

  return {
    title: pageTitle === "" ? collapsed(result.title) : pageTitle,
    author: author === "" ? null : author,
    words: result.wordCount,
    postText: ENCODER.encode(postText).length > MAX_TEXT_BYTES ? null : postText,
    postedAt: postedAtOf(result.published),
  };
}
