import type { Context } from "hono";

import { retryAfterSeconds } from "../core/agent-token-budget.ts";
import { groupedNumber } from "../core/format.ts";
import { BUDGET_SPENT, type BudgetSpent } from "../core/kinds.ts";
import type { ResetResult } from "../core/owner-password.ts";
import type { SetupBlock } from "../core/owner.ts";
import { PASSWORD_MAX, PASSWORD_MIN, type PasswordProblem } from "../core/passwords.ts";
import { RESET_CODE_MIN, SETUP_CODE_MIN } from "../core/setup-code.ts";
import type { RefusalCode } from "./schemas.ts";

const MESSAGES = {
  wrong: "The setup code is wrong",
  "owner-exists": "An owner exists already",
  locked: "Too many wrong tries",
  "setup-missing": "This Instance has no setup code",
  "setup-short": `The setup code is shorter than ${SETUP_CODE_MIN} characters, so it is not used`,
  "password-short": `The password must have at least ${PASSWORD_MIN} characters`,
  "password-long": `The password must have at most ${groupedNumber(PASSWORD_MAX)} characters`,
  "password-changed": "The password changed while this call ran, so nothing was done",
  "reset-missing": "This Instance has no reset code",
  "reset-short": `The reset code is shorter than ${RESET_CODE_MIN} characters, so it is not used`,
  "reset-used": "The reset code was used already",
  "no-owner": "This Instance has no owner yet",
} as const satisfies Record<RefusalCode, string>;

export const NOT_FOUND = "Not found";

export const REFUSED_HOST = "url: the host is not globally reachable";

export const UPDATING =
  "The library is being updated and takes no new link yet. Try again in a minute.";

const WRONG_PASSWORD = "The password is wrong";

const WRONG_RESET_CODE = "The reset code is wrong";

export const PASSWORD_RULE = `The password is shorter than ${PASSWORD_MIN} or longer than ${groupedNumber(PASSWORD_MAX)} characters.`;

export function notFound(c: Context) {
  return c.json({ error: NOT_FOUND }, 404);
}

export function locked(c: Context, retryAfter: number) {
  c.header("Retry-After", String(retryAfter));

  return c.json({ error: MESSAGES.locked, code: "locked" } as const, 429);
}

export const BUDGET_SPENT_MESSAGE =
  "This agent token has added its daily budget of Items, so nothing was saved. The budget starts again at 00:00 UTC.";

export function budgetRefusalOf(spent: Readonly<BudgetSpent>) {
  return { code: BUDGET_SPENT, retryAfter: retryAfterSeconds(spent, Date.now()) } as const;
}

export function budgetSpent(c: Context, spent: Readonly<BudgetSpent>) {
  c.header("Retry-After", String(retryAfterSeconds(spent, Date.now())));

  return c.json({ error: BUDGET_SPENT_MESSAGE, code: BUDGET_SPENT } as const, 429);
}

export function wrongPassword(c: Context) {
  return c.json({ error: WRONG_PASSWORD, code: "wrong" } as const, 401);
}

export function wrongCurrentPassword(c: Context) {
  return c.json({ error: WRONG_PASSWORD, code: "wrong" } as const, 403);
}

export function superseded(c: Context) {
  return c.json({ error: MESSAGES["password-changed"], code: "password-changed" } as const, 409);
}

export function badPassword(c: Context, problem: PasswordProblem) {
  const code = `password-${problem}` as const;

  return c.json({ error: MESSAGES[code], code }, 400);
}

export function refuse(c: Context, block: SetupBlock) {
  switch (block.kind) {
    case "owner-exists":
      return c.json({ error: MESSAGES["owner-exists"], code: "owner-exists" } as const, 409);
    case "unavailable": {
      const code = `setup-${block.reason}` as const;

      return c.json({ error: MESSAGES[code], code }, 503);
    }

    case "locked":
      return locked(c, block.retryAfter);
    case "wrong":
      return c.json({ error: MESSAGES.wrong, code: "wrong" } as const, 401);
    default:
      return block satisfies never;
  }
}

type ResetBlock = Exclude<ResetResult, { readonly kind: "reset" | "password" }>;

export function refuseReset(c: Context, block: ResetBlock) {
  switch (block.kind) {
    case "no-owner":
      return c.json({ error: MESSAGES["no-owner"], code: "no-owner" } as const, 409);
    case "used":
      return c.json({ error: MESSAGES["reset-used"], code: "reset-used" } as const, 409);
    case "superseded":
      return superseded(c);
    case "unavailable": {
      const code = `reset-${block.reason}` as const;

      return c.json({ error: MESSAGES[code], code }, 503);
    }

    case "locked":
      return locked(c, block.retryAfter);
    case "wrong":
      return c.json({ error: WRONG_RESET_CODE, code: "wrong" } as const, 403);
    default:
      return block satisfies never;
  }
}
