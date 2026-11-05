import type { Context } from "hono";

import { groupedNumber } from "../core/format.ts";
import type { SetupBlock } from "../core/owner.ts";
import { PASSWORD_MAX, PASSWORD_MIN, type PasswordProblem } from "../core/passwords.ts";
import { SETUP_CODE_MIN } from "../core/setup-code.ts";
import type { RefusalCode } from "./schemas.ts";

const MESSAGES = {
  wrong: "The setup code is wrong",
  "owner-exists": "An owner exists already",
  locked: "Too many wrong tries",
  "setup-missing": "This Instance has no setup code",
  "setup-short": `The setup code is shorter than ${SETUP_CODE_MIN} characters, so it is not used`,
  "password-short": `The password must have at least ${PASSWORD_MIN} characters`,
  "password-long": `The password must have at most ${groupedNumber(PASSWORD_MAX)} characters`,
} as const satisfies Record<RefusalCode, string>;

const WRONG_PASSWORD = "The password is wrong";

export const PASSWORD_RULE = `The password is shorter than ${PASSWORD_MIN} or longer than ${groupedNumber(PASSWORD_MAX)} characters.`;

export function locked(c: Context, retryAfter: number) {
  c.header("Retry-After", String(retryAfter));

  return c.json({ error: MESSAGES.locked, code: "locked" } as const, 429);
}

export function wrongPassword(c: Context) {
  return c.json({ error: WRONG_PASSWORD, code: "wrong" } as const, 401);
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
