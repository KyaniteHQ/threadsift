import { parseHTML } from "linkedom";
import { z } from "zod";

import { collapsed } from "../../../core/contract/format.ts";
import { guardedFetch } from "../../../core/kernel/fetch-guard.ts";
import { SMALL_POLICY } from "../../../core/kernel/fetch-policies.ts";
import type { Network } from "../../../core/kernel/network.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { type Concluded, fetchedOf } from "../../media/core/details.ts";

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

function detailsOfOembed(text: string): Concluded {
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

export async function fetchedOfOembed(
  network: Network,
  normalizedUrl: string,
  deadline: AbortSignal,
): Promise<Concluded> {
  const outcome = await guardedFetch(
    network,
    `https://www.reddit.com/oembed?url=${encodeURIComponent(normalizedUrl)}`,
    SMALL_POLICY,
    deadline,
  );

  return fetchedOf(outcome, ({ text }) => detailsOfOembed(text), "unreadable");
}
