import type { Fetched } from "../../media/core/details.ts";
import { concludedOfRefusal } from "./x-api-answer.ts";
import { type XApiReads, parsedLookup, parsedPage, rootState } from "./x-api-map.ts";
import type { XApiRequest } from "./x-api-plan.ts";
import type { XApiSent } from "./x-api-request.ts";
import { nextUtcDayAt } from "./x-api-spend.ts";
import { ANSWER_REFUSED } from "./x-api-stored.ts";

const POST_ABSENT: Fetched = { status: "status", note: "x-post-absent" };

export type Step =
  | { readonly kind: "read"; readonly reads: XApiReads }
  | { readonly kind: "ended"; readonly fetched: Fetched }
  | { readonly kind: "finished"; readonly why: string };

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

  return state === "absent"
    ? { kind: "ended", fetched: POST_ABSENT }
    : { kind: "read", reads: { ...reads, root } };
}

function laterStep(reads: Readonly<XApiReads>, request: Readonly<XApiRequest>, text: string): Step {
  if (request.step === "quote") {
    const quote = parsedLookup(text);

    return quote === null
      ? { kind: "finished", why: "answer-refused" }
      : { kind: "read", reads: { ...reads, quoteLookups: [...reads.quoteLookups, quote] } };
  }

  const page = parsedPage(text);
  const step = request.step === "author" ? "author" : "replies";

  return page === null
    ? { kind: "finished", why: "answer-refused" }
    : {
        kind: "read",
        reads: {
          ...reads,
          searches: [...reads.searches, { step, minLikes: request.minLikes, page }],
        },
      };
}

function failedStep(
  reads: Readonly<XApiReads>,
  answer: Exclude<XApiSent["answer"], { kind: "ok" }>,
): Step {
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
  { answer }: Readonly<XApiSent>,
): Step {
  if (answer.kind !== "ok") return failedStep(reads, answer);

  return request.step === "root"
    ? rootStep(reads, answer.text)
    : laterStep(reads, request, answer.text);
}
