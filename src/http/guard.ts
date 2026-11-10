import type { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";

import type { Ports } from "../core/ports.ts";
import { ITEM_REQUEST_BYTES } from "../core/request-limits.ts";
import { tokenIsValid } from "../core/tokens.ts";
import { isOwnerOnly, isPublic } from "./access-rules.ts";
import { ownerHasSession } from "./session-cookie.ts";

export const BODY_LIMIT_BYTES = 64 * 1024;

export const bodyCap = bodyLimit({
  maxSize: BODY_LIMIT_BYTES,
  onError: (c) => c.json({ error: "The request body is larger than 64 KiB" }, 413),
});

const itemCap = bodyLimit({
  maxSize: ITEM_REQUEST_BYTES,
  onError: (c) => c.json({ error: "The request body is larger than 8 MiB" }, 413),
});

function capFor(method: string, path: string): MiddlewareHandler {
  return method === "POST" && path === "/api/items" ? itemCap : bodyCap;
}

const NOT_BEARER = "Authorization header is not a bearer token";

function notBearer(c: Context): Response {
  return c.json({ error: NOT_BEARER }, 400);
}

function bearerCheck(ports: Ports): MiddlewareHandler {
  return bearerAuth({
    verifyToken: (value) => tokenIsValid(ports, value),
    noAuthenticationHeader: { message: notBearer },
    invalidAuthenticationHeader: { message: { error: NOT_BEARER } },
    invalidToken: { message: { error: "Unknown or revoked agent token" } },
  });
}

export function guard(ports: Ports): MiddlewareHandler {
  const bearer = bearerCheck(ports);
  const cross = csrf();

  return async (c, next) => {
    const { method, path } = c.req;
    const protectedRoute = !isPublic(method, path);
    const carriesToken = protectedRoute && c.req.header("authorization") !== undefined;

    if (protectedRoute) {
      if (carriesToken) {
        await bearer(c, async () => {});

        if (isOwnerOnly(path)) {
          return c.json({ error: "Agent tokens cannot use this route" }, 403);
        }
      } else if (!(await ownerHasSession(c, ports))) {
        return c.json({ error: "Sign in or send an agent token" }, 401);
      }
    }

    if (!carriesToken) {
      await cross(c, async () => {});
    }

    return capFor(method, path)(c, next);
  };
}
