import type { Context, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HTTPResponseError } from "hono/types";
import type { JSONParsed } from "hono/utils/types";

import { groupedNumber } from "../core/contract/format.ts";
import { PASSWORD_MAX, PASSWORD_MIN } from "../core/contract/passwords.ts";
import { logFailure } from "../core/kernel/failure-log.ts";
import type { LockedOut, RefusalName, Refused } from "../features/access/core/access-refusal.ts";
import type { AdmissionRefusal, Refusal } from "../features/paste/core/paste-refusal.ts";
import { challengeOf } from "./bearer.ts";

type AccessRefusal = Refused<RefusalName> | LockedOut;

export const NOT_FOUND = "Not found";

export const INTERNAL_ERROR = "Internal error";

const METHOD_NOT_ALLOWED = "Method not allowed";

export const PASSWORD_RULE = `The password is shorter than ${PASSWORD_MIN} or longer than ${groupedNumber(PASSWORD_MAX)} characters.`;

export function notFound(c: Context) {
  return c.json({ error: NOT_FOUND }, 404);
}

export function notAllowed(c: Context, methods: readonly string[]) {
  return c.json({ error: METHOD_NOT_ALLOWED }, 405, { Allow: methods.join(", ") });
}

function logRequestFailure(path: string, cause: unknown): void {
  logFailure("request-failed", { path }, cause);
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

  logRequestFailure(c.req.path, error);

  return c.json({ error: INTERNAL_ERROR }, 500);
}

export function failedRequest(path: string, cause: unknown): Response {
  logRequestFailure(path, cause);

  return Response.json({ error: INTERNAL_ERROR }, { status: 500 });
}

export function turnedAway(c: Context, refusal: Readonly<AccessRefusal>): Response {
  if ("retryAfter" in refusal) c.header("Retry-After", String(refusal.retryAfter));

  return c.json(refusal.body, refusal.status);
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
      return c.json(refusal.body, 401, challengeOf("unknown"));
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
