import { z } from "zod";

import { X_API_PROBLEMS, type XApiRefusal } from "../../../core/contract/x-api-contract.ts";
import type { XReadNote } from "../../../core/contract/x-read-note.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import type { Concluded } from "../../media/core/details.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const PAYMENT_REQUIRED = 402;
const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERRORS = 500;

const NOT_ENROLLED = new Set([
  `${X_API_PROBLEMS}client-not-enrolled`,
  `${X_API_PROBLEMS}client-forbidden`,
]);

const USAGE_CAPPED = `${X_API_PROBLEMS}usage-capped`;

const IP_NOT_ALLOWED = /^client IP not allowed\b/u;

const LIMIT_WAIT_MS = 60_000;

const ProblemSchema = z.looseObject({
  type: z.string().optional(),
  detail: z.string().optional(),
});

export interface XApiWire {
  readonly status: number;
  readonly header: (name: string) => string | null;
  readonly text: string;
}

export type XApiAnswer =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "limited"; readonly until: number }
  | { readonly kind: "refused"; readonly reason: XApiRefusal; readonly status: number | null };

function problemOf(text: string): z.output<typeof ProblemSchema> {
  return parsedJson(ProblemSchema, text) ?? {};
}

function resetOf(header: XApiWire["header"], now: number): number {
  const reset = Number(header("x-rate-limit-reset") ?? "");

  return Number.isInteger(reset) && reset * 1000 > now ? reset * 1000 : now + LIMIT_WAIT_MS;
}

function refused(reason: XApiRefusal, status: number): XApiAnswer {
  return { kind: "refused", reason, status };
}

function forbiddenReason(text: string): XApiRefusal {
  const { type, detail } = problemOf(text);

  if (type !== undefined && NOT_ENROLLED.has(type)) return "api-not-enrolled";

  return detail !== undefined && IP_NOT_ALLOWED.test(detail) ? "api-ip-blocked" : "api-refused";
}

export function answerOf({ status, header, text }: Readonly<XApiWire>, now: number): XApiAnswer {
  if (status === OK) return { kind: "ok", text };

  switch (status) {
    case UNAUTHORIZED:
      return refused("api-key-rejected", status);
    case PAYMENT_REQUIRED:
      return refused("api-out-of-credits", status);
    case FORBIDDEN:
      return refused(forbiddenReason(text), status);
    case TOO_MANY_REQUESTS:
      return problemOf(text).type === USAGE_CAPPED
        ? refused("api-out-of-credits", status)
        : { kind: "limited", until: resetOf(header, now) };
    default:
      return refused(status >= SERVER_ERRORS ? "api-unreachable" : "api-refused", status);
  }
}

type FailureRefusal = Exclude<
  XApiRefusal,
  "secret-missing" | "not-configured" | "api-rate-limited"
>;

const NOTE_OF_REFUSAL = {
  "api-key-rejected": "api-key-rejected",
  "api-not-enrolled": "api-not-enrolled",
  "api-ip-blocked": "api-ip-blocked",
  "api-out-of-credits": "api-out-of-credits",
  "api-refused": "api-refused",
  "api-unreachable": "api-unreachable",
  "api-answer-refused": "api-answer-unreadable",
} as const satisfies Readonly<Record<FailureRefusal, XReadNote>>;

export function concludedOfRefusal(reason: XApiRefusal): Concluded {
  switch (reason) {
    case "secret-missing":
      return { status: "not-requested", note: "api-key-unopened" };
    case "not-configured":
      return { status: "not-requested", note: "api-not-set-up" };
    case "api-unreachable":
    case "api-rate-limited":
      return { status: "network", note: "api-unreachable" };
    case "api-answer-refused":
      return { status: "unreadable", note: NOTE_OF_REFUSAL[reason] };
    case "api-key-rejected":
    case "api-not-enrolled":
    case "api-ip-blocked":
    case "api-out-of-credits":
    case "api-refused":
      return { status: "not-requested", note: NOTE_OF_REFUSAL[reason] };
    default: {
      const exhaustive: never = reason;

      return exhaustive;
    }
  }
}
