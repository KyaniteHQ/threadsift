import type { Context, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HTTPResponseError } from "hono/types";
import type { JSONParsed } from "hono/utils/types";

import { logFailure } from "../core/failure-log.ts";
import { groupedNumber } from "../core/format.ts";
import type { ResetResult } from "../core/owner-password.ts";
import type { SetupBlock } from "../core/owner.ts";
import { PASSWORD_MAX, PASSWORD_MIN, type PasswordProblem } from "../core/passwords.ts";
import type { AdmissionRefusal, Refusal } from "../core/paste-refusal.ts";
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

const WRONG_PASSWORD = "The password is wrong";

const WRONG_RESET_CODE = "The reset code is wrong";

export const PASSWORD_RULE = `The password is shorter than ${PASSWORD_MIN} or longer than ${groupedNumber(PASSWORD_MAX)} characters.`;

export function notFound(c: Context) {
  return c.json({ error: NOT_FOUND }, 404);
}

export async function answerFailure(
  error: Readonly<Error | HTTPResponseError>,
  c: Context,
): Promise<Response> {
  if (error instanceof HTTPException) {
    const refusal = error.getResponse();

    if (refusal.headers.get("content-type")?.includes("application/json") === true) {
      return refusal;
    }

    return c.json({ error: (await refusal.text()) || "Request refused" }, error.status);
  }

  logFailure("request-failed", { path: c.req.path }, error);

  return c.json({ error: "Internal error" }, 500);
}

export function locked(c: Context, retryAfter: number) {
  c.header("Retry-After", String(retryAfter));

  return c.json({ error: MESSAGES.locked, code: "locked" } as const, 429);
}

type Answer<Status extends Refusal["status"]> = Response &
  TypedResponse<JSONParsed<Extract<Refusal, { readonly status: Status }>["body"]>, Status, "json">;

export function refusing(
  c: Context,
  refusal: Readonly<AdmissionRefusal>,
): Answer<401> | Answer<429> | Answer<503>;
export function refusing(
  c: Context,
  refusal: Readonly<Refusal>,
): Answer<401> | Answer<429> | Answer<503> | Answer<400> | Answer<409 | 413>;
export function refusing(c: Context, refusal: Readonly<Refusal>) {
  switch (refusal.status) {
    case 401: {
      return c.json(refusal.body, 401, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    }

    case 429: {
      c.header("Retry-After", String(refusal.retryAfter));

      return c.json(refusal.body, 429);
    }

    case 503: {
      return c.json(refusal.body, 503);
    }

    case 400: {
      return c.json(refusal.body, 400);
    }

    case 409:
    case 413: {
      return c.json(refusal.body, refusal.status);
    }

    default: {
      return refusal satisfies never;
    }
  }
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
