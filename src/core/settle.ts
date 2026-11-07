import type { Content, Fetched } from "./details.ts";
import type { FetchResult } from "./fetch-results.ts";
import type { FailureReason } from "./kinds.ts";
import { sourceOf } from "./links.ts";
import type { ItemRow } from "./schema.ts";

type Settled = Pick<ItemRow, "status" | "reason" | "fetch"> &
  Partial<
    Pick<
      ItemRow,
      "title" | "author" | "community" | "fetchedAt" | "source" | "kind" | "postText" | "postedAt"
    >
  >;

const NO_TEXT = { postText: null, postedAt: null } as const;

function textFields(content: Readonly<Content>) {
  switch (content.kind) {
    case "article":
      return { postText: content.postText, postedAt: content.postedAt };
    case "github-repo":
      return { postText: content.readme, postedAt: null };
    case "link":
      return NO_TEXT;
    default: {
      const exhaustive: never = content;

      throw new Error(exhaustive);
    }
  }
}

function contentFields(content: Readonly<Content>) {
  return { source: sourceOf(content.kind), kind: content.kind, ...textFields(content) };
}

export function isRetryable(result: FetchResult): result is Extract<FailureReason, FetchResult> {
  return result === "timeout" || result === "network";
}

export function settle(fetched: Readonly<Fetched>, current: string | null, now: number): Settled {
  if (fetched.status === "ok") {
    const { content, ...found } = fetched.found;

    const settled: Settled = {
      status: "ready",
      reason: null,
      fetch: "ok",
      ...found,
      fetchedAt: now,
    };

    return content === null ? settled : { ...settled, ...contentFields(content) };
  }

  const result = fetched.status;

  if (isRetryable(result) && current === null) {
    return { status: "failed", reason: result, fetch: result };
  }

  return { status: "ready", reason: null, fetch: result };
}
