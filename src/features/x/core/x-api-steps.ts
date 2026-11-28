import { X_POST_ABSENT } from "../../../core/contract/x-read-note.ts";
import type { Fetched } from "../../media/core/details.ts";
import { type XApiAnswer, concludedOfRefusal } from "./x-api-answer.ts";
import { type XApiReads, threadOf } from "./x-api-map.ts";
import type { XApiRequest } from "./x-api-plan.ts";
import { parsedLookup, parsedPage, rootState } from "./x-api-posts.ts";
import { nextUtcDayAt } from "./x-api-spend.ts";
import { ANSWER_REFUSED } from "./x-api-stored.ts";

type Refused = Extract<XApiAnswer, { kind: "refused" }>["reason"];

export type Ending = "done" | "limit" | "api-rate-limited" | Refused;

export type Step =
  | { readonly kind: "read"; readonly reads: XApiReads }
  | { readonly kind: "ended"; readonly fetched: Fetched }
  | { readonly kind: "finished"; readonly why: Ending };

export function unaffordable(reads: Readonly<XApiReads>): Step {
  return reads.root === null
    ? {
        kind: "ended",
        fetched: {
          status: "waiting",
          until: nextUtcDayAt(Date.now()),
          limited: false,
          wait: "x-api-budget",
        },
      }
    : { kind: "finished", why: "limit" };
}

function rootStep(reads: Readonly<XApiReads>, text: string): Step {
  const root = parsedLookup(text);
  const state = root === null ? "refused" : rootState(root, reads.statusId);

  if (root === null || state === "refused") return { kind: "ended", fetched: ANSWER_REFUSED };

  if (state === "absent") return { kind: "ended", fetched: X_POST_ABSENT };

  const read = { ...reads, root };

  return threadOf(read) === null
    ? { kind: "ended", fetched: ANSWER_REFUSED }
    : { kind: "read", reads: read };
}

function quoteStep(reads: Readonly<XApiReads>, postId: string, text: string): Step {
  const quote = parsedLookup(text);
  const quotesAsked = [...reads.quotesAsked, postId];

  return quote === null
    ? { kind: "finished", why: "api-answer-refused" }
    : {
        kind: "read",
        reads: { ...reads, quotesAsked, quoteLookups: [...reads.quoteLookups, quote] },
      };
}

function laterStep(reads: Readonly<XApiReads>, request: Readonly<XApiRequest>, text: string): Step {
  if (request.step === "root") return rootStep(reads, text);

  if (request.step === "quote") return quoteStep(reads, request.postId, text);

  const page = parsedPage(text);
  const minLikes = request.step === "replies" ? request.minLikes : null;

  return page === null
    ? { kind: "finished", why: "api-answer-refused" }
    : {
        kind: "read",
        reads: {
          ...reads,
          searches: [...reads.searches, { step: request.step, minLikes, page }],
        },
      };
}

function failedStep(reads: Readonly<XApiReads>, answer: Exclude<XApiAnswer, { kind: "ok" }>): Step {
  const why = answer.kind === "limited" ? "api-rate-limited" : answer.reason;

  if (reads.root !== null) return { kind: "finished", why };

  return {
    kind: "ended",
    fetched:
      answer.kind === "limited"
        ? { status: "waiting", until: answer.until, limited: true, wait: "x-api-rate" }
        : concludedOfRefusal(answer.reason),
  };
}

export function appliedStep(
  reads: Readonly<XApiReads>,
  request: Readonly<XApiRequest>,
  answer: Readonly<XApiAnswer>,
): Step {
  return answer.kind === "ok" ? laterStep(reads, request, answer.text) : failedStep(reads, answer);
}
