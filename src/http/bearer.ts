import type { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";

import { UNKNOWN_TOKEN } from "../core/tokens.ts";

const NOT_BEARER = "Authorization header is not a bearer token";

function notBearer(c: Context): Response {
  return c.json({ error: NOT_BEARER }, 400);
}

export function bearerCheck(
  verified: (value: string, c: Context) => Promise<boolean>,
): MiddlewareHandler {
  return bearerAuth({
    verifyToken: verified,
    noAuthenticationHeader: { message: notBearer },
    invalidAuthenticationHeader: { message: { error: NOT_BEARER } },
    invalidToken: { message: { error: UNKNOWN_TOKEN } },
  });
}
