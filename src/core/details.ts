import { parseHTML } from "linkedom";
import { z } from "zod";

import type { FetchFailure } from "./fetch-results.ts";

export interface Found {
  readonly title: string;
  readonly author: string | null;
  readonly community: string | null;
}

export type Fetched =
  | { readonly status: "ok"; readonly found: Found }
  | { readonly status: FetchFailure | "not-requested" };

export const NOT_REQUESTED: Fetched = { status: "not-requested" };

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

function collapsed(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

export function detailsOfPage(html: string): Fetched {
  const { document } = parseHTML(html);

  const title = [...document.querySelectorAll("title")].find(
    (element) => element.closest("svg") === null,
  );

  const text = collapsed(title?.textContent ?? "");

  return text === ""
    ? { status: "no-title" }
    : { status: "ok", found: { title: text, author: null, community: null } };
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
    },
  };
}
