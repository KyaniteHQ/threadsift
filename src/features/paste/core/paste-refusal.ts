import {
  BUDGET_SPENT,
  type BudgetSpent,
  UNKNOWN_TOKEN,
} from "../../../core/contract/agent-token-contract.ts";
import { byteSize } from "../../../core/contract/format.ts";
import { THREAD_CONTENT_BYTES } from "../../../core/contract/limits.ts";
import {
  PASTE_RESTORING_REFUSAL,
  RESTORING_CODE,
} from "../../../core/contract/restore-contract.ts";
import { PAGE_BYTES, type UNSUPPORTED_PAGE_LINK } from "../../../core/contract/supplied-page.ts";
import type {
  Invalid,
  NotWaiting,
  Refused,
  ThreadKept,
  TooLarge,
} from "../../../core/kernel/paste-outcome.ts";
import type { Closed } from "../../../core/kernel/restore-hold.ts";
import { type UnknownToken, retryAfterSeconds } from "../../access/core/agent-token-budget.ts";

const REFUSED_HOST = "url: the host is not globally reachable";

const BUDGET_SPENT_MESSAGE =
  "This agent token has added its daily budget of Items, so nothing was saved. The budget starts again at 00:00 UTC.";

export const BATCH_CUT_SHORT =
  "This agent token used up its daily budget of Items while the batch ran. `results` holds the links saved before that, and the import cursor stays. The budget starts again at 00:00 UTC.";

const TOO_LARGE = {
  content: `content: longer than ${byteSize(THREAD_CONTENT_BYTES)}`,
  page: `page: longer than ${byteSize(PAGE_BYTES)}`,
} as const;

const THREAD_KEPT = "page: the saved thread stays";

const NOT_WAITING = "fill: no Item with this link is waiting for its thread";

type Unsaved =
  | UnknownToken
  | BudgetSpent
  | Closed
  | Refused
  | TooLarge<keyof typeof TOO_LARGE>
  | Invalid<string>
  | NotWaiting
  | ThreadKept;

export type Refusal =
  | {
      readonly kind: "unknown-token";
      readonly status: 401;
      readonly body: { readonly error: string };
    }
  | {
      readonly kind: "budget-spent";
      readonly status: 429;
      readonly body: { readonly error: string; readonly code: typeof BUDGET_SPENT };
      readonly retryAfter: number;
    }
  | {
      readonly kind: "restoring";
      readonly status: 503;
      readonly body: { readonly error: string; readonly code: typeof RESTORING_CODE };
    }
  | {
      readonly kind: "refused";
      readonly status: 400;
      readonly body: { readonly error: string; readonly fetch: "refused" };
    }
  | {
      readonly kind: "invalid";
      readonly status: 400;
      readonly body: {
        readonly error: string;
        readonly code?: typeof UNSUPPORTED_PAGE_LINK | undefined;
      };
    }
  | {
      readonly kind: "too-large";
      readonly status: 413;
      readonly body: { readonly error: string };
    }
  | {
      readonly kind: "not-waiting" | "thread-kept";
      readonly status: 409;
      readonly body: { readonly error: string };
    };

export type AdmissionRefusal = Extract<Refusal, { readonly status: 401 | 429 | 503 }>;

export function refusalOf(outcome: Readonly<UnknownToken | BudgetSpent | Closed>): AdmissionRefusal;
export function refusalOf(outcome: Readonly<Unsaved>): Refusal;
export function refusalOf(outcome: Readonly<Unsaved>): Refusal {
  switch (outcome.kind) {
    case "unknown-token": {
      return { kind: outcome.kind, status: 401, body: { error: UNKNOWN_TOKEN } };
    }

    case "budget-spent": {
      return {
        kind: outcome.kind,
        status: 429,
        body: { error: BUDGET_SPENT_MESSAGE, code: BUDGET_SPENT },
        retryAfter: retryAfterSeconds(outcome, Date.now()),
      };
    }

    case "restoring": {
      return { kind: outcome.kind, status: 503, body: PASTE_RESTORING_REFUSAL };
    }

    case "refused": {
      return { kind: outcome.kind, status: 400, body: { error: REFUSED_HOST, fetch: "refused" } };
    }

    case "too-large": {
      return { kind: outcome.kind, status: 413, body: { error: TOO_LARGE[outcome.field] } };
    }

    case "invalid": {
      return {
        kind: outcome.kind,
        status: 400,
        body: { error: `${outcome.field}: ${outcome.reason}`, code: outcome.code },
      };
    }

    case "not-waiting": {
      return { kind: outcome.kind, status: 409, body: { error: NOT_WAITING } };
    }

    case "thread-kept": {
      return { kind: outcome.kind, status: 409, body: { error: THREAD_KEPT } };
    }

    default: {
      const exhaustive: never = outcome;

      return exhaustive;
    }
  }
}
