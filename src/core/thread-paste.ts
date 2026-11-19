import type { Digest } from "./ai-contract.ts";
import { type Caller, tokenIdOf } from "./caller.ts";
import type { Saved } from "./item-rows.ts";
import { savedItem } from "./item-save.ts";
import { parseLink } from "./links.ts";
import type { Invalid, NotWaiting, TooLarge } from "./paste-outcome.ts";
import type { Ports } from "./ports.ts";
import { type ThreadAnswers, fitsContentLimit } from "./thread-answers.ts";
import { parsedThread } from "./thread-input.ts";
import { publishThread } from "./thread-save.ts";
import { threadSourceOf } from "./thread-source.ts";

export type ThreadPasteResult =
  | Saved
  | Invalid<"content" | "fill">
  | NotWaiting
  | TooLarge<"content">;

export const FILL_NEEDS_CONTENT: Invalid<"fill"> = {
  kind: "invalid",
  field: "fill",
  reason: "a fill takes the content of a thread",
};

const FILL_IS_REDDIT_ONLY: Invalid<"fill"> = {
  kind: "invalid",
  field: "fill",
  reason: "only a Reddit thread can be filled",
};

export async function saveThread(
  ports: Ports,
  absoluteUrl: string,
  {
    digest,
    answers,
    fillOnly,
    caller,
  }: Readonly<{
    digest: Digest | undefined;
    answers: ThreadAnswers;
    fillOnly: boolean;
    caller: Caller;
  }>,
): Promise<ThreadPasteResult> {
  if (!fitsContentLimit(answers)) return { kind: "too-large", field: "content" };

  const source = threadSourceOf(absoluteUrl);

  if (fillOnly && source.kind === "x") return FILL_IS_REDDIT_ONLY;

  const parsed = parsedThread(source, answers);

  if (parsed.kind === "refused") {
    return { kind: "invalid", field: "content", reason: parsed.reason };
  }

  const { db } = ports;

  const place = {
    ...parseLink(absoluteUrl),
    address: absoluteUrl,
    addedByToken: tokenIdOf(caller),
    thread: source,
  };

  const published = await publishThread(db, place, parsed.thread, {
    pendingDigest: digest === undefined ? null : JSON.stringify(digest),
    fillOnly,
  });

  if (published.kind !== "published") return published;

  return savedItem(ports, place.normalizedUrl, published.created);
}
