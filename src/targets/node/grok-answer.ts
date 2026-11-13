import { z } from "zod";

import { errnoCodeOf, errorClassOf, report } from "../../core/failure-log.ts";
import { parsedJson } from "../../core/parsed-json.ts";
import type { XFetch, XFetchFailure, XRefusalCategory } from "../../core/x-fetcher.ts";
import type { XThreadValue } from "../../core/x-wire.ts";
import type { ProcessEnd } from "./cli-process.ts";
import { XFetchAnswerSchema } from "./grok-surface.ts";

export interface Refusal {
  readonly status: XFetchFailure;
  readonly category: XRefusalCategory;
}

export interface Refused {
  readonly kind: "refused";
  readonly refusal: Refusal;
  readonly exit: number | null;
}

export type Outcome =
  | { readonly kind: "fetched"; readonly fetch: XFetch; readonly repaired: number }
  | Refused;

const EnvelopeSchema = z.object({
  text: z.string(),
  structuredOutput: z.unknown().optional(),
});

type Envelope = z.output<typeof EnvelopeSchema>;

const ErrorSchema = z.object({ type: z.literal("error"), message: z.string() });

const SIGNED_OUT = /not signed in|not authenticated|unauthori[sz]ed|\b401\b|log ?in/iu;
const USAGE_LIMIT = /usage limit|rate limit|quota|\b429\b|too many requests/iu;
const UNREACHABLE = /network|connect|dns|resolve|unreachable|offline|timed out/iu;

function messageRefusal(message: string): Refusal {
  if (SIGNED_OUT.test(message)) return { status: "unreadable", category: "signed-out" };

  if (USAGE_LIMIT.test(message)) return { status: "network", category: "usage-limit" };

  if (UNREACHABLE.test(message)) return { status: "network", category: "unreachable" };

  return { status: "unreadable", category: "cli-error" };
}

export function refused(refusal: Refusal, exit: number | null): Refused {
  return { kind: "refused", refusal, exit };
}

export const SURFACE_REFUSAL = refused(
  { status: "unreadable", category: "surface-unproven" },
  null,
);

function repairedParents({ post, replies }: XThreadValue) {
  const known = new Set([post.id, ...replies.map(({ id }) => id)]);

  const repaired = replies.filter(({ parentId }) => !known.has(parentId)).length;

  const mended = replies.map((reply) =>
    known.has(reply.parentId) ? reply : { ...reply, parentId: post.id },
  );

  return { thread: { post, replies: mended }, repaired };
}

function answerOutcome({ structuredOutput }: Readonly<Envelope>, exit: number | null): Outcome {
  const answer = XFetchAnswerSchema.safeParse(structuredOutput);

  if (!answer.success) return refused({ status: "unreadable", category: "no-answer" }, exit);

  if (!answer.data.found) {
    return { kind: "fetched", fetch: { kind: "failed", status: "status" }, repaired: 0 };
  }

  const { thread, repaired } = repairedParents(answer.data.thread);

  return { kind: "fetched", fetch: { kind: "thread", thread }, repaired };
}

function exitedOutcome(stdout: string, code: number | null): Outcome {
  const error = parsedJson(ErrorSchema, stdout);

  if (error !== null) return refused(messageRefusal(error.message), code);

  const envelope = parsedJson(EnvelopeSchema, stdout);

  if (envelope === null || code !== 0) {
    return refused({ status: "unreadable", category: "cli-error" }, code);
  }

  return answerOutcome(envelope, code);
}

export function outcomeOf(end: Readonly<ProcessEnd>): Outcome {
  switch (end.kind) {
    case "exited":
      return exitedOutcome(end.stdout, end.code);
    case "aborted":
      return refused({ status: "timeout", category: "deadline" }, null);
    case "over-cap":
      return refused({ status: "unreadable", category: "over-size" }, null);
    case "spawn-failed":
      return refused({ status: "unreadable", category: "spawn-failed" }, null);
    default: {
      const exhaustive: never = end;

      return exhaustive;
    }
  }
}

export function refusalOf(end: Readonly<ProcessEnd>): Refused {
  const outcome = outcomeOf(end);

  return outcome.kind === "refused" ? outcome : SURFACE_REFUSAL;
}

export function versionRefusal(end: Readonly<ProcessEnd>): Refused {
  switch (end.kind) {
    case "exited":
      return refused({ status: "unreadable", category: "cli-error" }, end.code);
    case "aborted":
      return refused({ status: "timeout", category: "deadline" }, null);
    case "over-cap":
      return refused({ status: "unreadable", category: "over-size" }, null);
    case "spawn-failed":
      return refused({ status: "unreadable", category: "spawn-failed" }, null);
    default: {
      const exhaustive: never = end;

      return exhaustive;
    }
  }
}

export function internal(cause: unknown): Refused {
  report("x-fetch-error", { error: errorClassOf(cause), code: errnoCodeOf(cause) });

  return refused({ status: "unreadable", category: "internal" }, null);
}

export function logged(outcome: Outcome, elapsedMs: number): XFetch {
  if (outcome.kind === "fetched") {
    const { fetch, repaired } = outcome;
    const replies = fetch.kind === "thread" ? fetch.thread.replies.length : 0;

    report("x-fetch", { replies, repaired, elapsedMs });

    return fetch;
  }

  const { refusal, exit } = outcome;

  report("x-fetch-refused", { category: refusal.category, exit: exit ?? "none" });

  return { kind: "failed", status: refusal.status };
}
