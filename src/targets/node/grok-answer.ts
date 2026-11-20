import { z } from "zod";

import { errnoCodeOf, errorClassOf, report } from "../../core/failure-log.ts";
import { parsedJson } from "../../core/parsed-json.ts";
import type { XFetch, XFetchFailure } from "../../core/x-fetcher-port.ts";
import { NOTE_OF_REFUSAL, type XRefusalCategory } from "../../core/x-fetcher.ts";
import type { XCliThreadValue } from "../../core/x-wire.ts";
import type { ProcessEnd, UnfinishedEnd } from "./cli-process.ts";
import { XFetchAnswerSchema } from "./grok-surface.ts";

interface Refusal {
  readonly status: XFetchFailure;
  readonly category: XRefusalCategory;
}

export interface Refused {
  readonly kind: "refused";
  readonly refusal: Refusal;
  readonly exit: number | null;
}

export type Outcome = { readonly kind: "fetched"; readonly fetch: XFetch } | Refused;

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

function withoutRepeats(thread: Readonly<XCliThreadValue>): XCliThreadValue {
  const seen = new Set<string>();

  return {
    ...thread,
    replies: thread.replies.filter(({ id }) => {
      if (seen.has(id)) return false;

      seen.add(id);

      return true;
    }),
  };
}

function lastObject(text: string): string {
  const end = text.trimEnd();
  let depth = 0;
  let quoted = false;

  if (!end.endsWith("}")) return "";

  for (let i = end.length - 1; i >= 0; i -= 1) {
    const char = end[i];

    if (char === '"') {
      let before = i - 1;
      while (end[before] === "\\") before -= 1;
      if ((i - before) % 2 === 1) quoted = !quoted;
    } else if (!quoted && char === "}") {
      depth += 1;
    } else if (!quoted && char === "{") {
      depth -= 1;
      if (depth === 0) return end.slice(i);
    }
  }
  return "";
}

function answerOutcome(
  { structuredOutput, text }: Readonly<Envelope>,
  exit: number | null,
): Outcome {
  const answer =
    structuredOutput === null
      ? parsedJson(XFetchAnswerSchema, lastObject(text))
      : (XFetchAnswerSchema.safeParse(structuredOutput).data ?? null);

  if (answer === null) return refused({ status: "unreadable", category: "no-answer" }, exit);

  if (!answer.found) {
    return { kind: "fetched", fetch: { kind: "failed", status: "status" } };
  }

  return { kind: "fetched", fetch: { kind: "thread", thread: withoutRepeats(answer.thread) } };
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

function unfinishedRefusal(end: Readonly<UnfinishedEnd>): Refused {
  switch (end.kind) {
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

export function outcomeOf(end: Readonly<ProcessEnd>): Outcome {
  return end.kind === "exited" ? exitedOutcome(end.stdout, end.code) : unfinishedRefusal(end);
}

export function refusalOf(end: Readonly<ProcessEnd>): Refused {
  const outcome = outcomeOf(end);

  return outcome.kind === "refused" ? outcome : SURFACE_REFUSAL;
}

export function versionRefusal(end: Readonly<ProcessEnd>): Refused {
  return end.kind === "exited"
    ? refused({ status: "unreadable", category: "cli-error" }, end.code)
    : unfinishedRefusal(end);
}

export function internal(cause: unknown): Refused {
  report("x-fetch-error", { error: errorClassOf(cause), code: errnoCodeOf(cause) });

  return refused({ status: "unreadable", category: "internal" }, null);
}

export function logged(outcome: Outcome, elapsedMs: number): XFetch {
  if (outcome.kind === "fetched") {
    const { fetch } = outcome;
    const replies = fetch.kind === "thread" ? fetch.thread.replies.length : 0;

    report("x-fetch", { replies, elapsedMs });

    return fetch;
  }

  const { refusal, exit } = outcome;

  report("x-fetch-refused", { category: refusal.category, exit: exit ?? "none" });

  if (refusal.category === "no-answer") {
    const note = NOTE_OF_REFUSAL["no-answer"];

    return { kind: "unanswered", ends: { status: refusal.status, note } };
  }

  const note = NOTE_OF_REFUSAL[refusal.category];

  return note === null
    ? { kind: "failed", status: refusal.status }
    : { kind: "failed", status: refusal.status, note };
}
