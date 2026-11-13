import { parseHTML } from "linkedom";
import { z } from "zod";

import type { Concluded } from "./details.ts";
import { collapsed } from "./format.ts";
import { parsedJson } from "./parsed-json.ts";

const SUBREDDIT_LINK = /^https:\/\/www\.reddit\.com\/r\/(?<name>[^/?#]+)\//u;

const OembedSchema = z.object({
  title: z.string(),
  author_name: z.string().optional(),
  html: z.string().optional(),
});

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
  const answer = parsedJson(OembedSchema, text);

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
