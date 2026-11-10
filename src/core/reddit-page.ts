import { collapsed } from "./format.ts";
import type { RedditRef } from "./links.ts";
import type { ThreadParse } from "./reddit-json.ts";
import { ThreadRefused, checkedMetadata } from "./reddit-tree.ts";
import type { SuppliedPage } from "./supplied-page.ts";

export function parseRedditPage(
  page: Readonly<SuppliedPage>,
  ref: Readonly<RedditRef>,
): ThreadParse {
  const title = collapsed(page.title);
  const author = page.author?.trim() ?? "";
  const postedAt = Date.parse(page.published ?? "");

  if (title === "") return { kind: "refused", reason: "the page has no title" };

  try {
    checkedMetadata({ "the page title": title, "the page author": author });

    return {
      kind: "thread",
      thread: {
        title,
        author: author === "" ? null : author,
        community: ref.community ?? null,
        postText: page.markdown.trim() === "" ? null : page.markdown,
        postedAt: Number.isNaN(postedAt) ? null : postedAt,
        reported: null,
        nodes: [],
      },
    };
  } catch (error) {
    if (error instanceof ThreadRefused) return { kind: "refused", reason: error.message };

    throw error;
  }
}
