import type { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";

import type { Ports } from "../core/ports.ts";
import { tokenIsValid } from "../core/tokens.ts";
import { isOwnerOnly, isPublic } from "./access-rules.ts";
import { ownerHasSession } from "./session-cookie.ts";

export const BODY_LIMIT_BYTES = 64 * 1024;

function bearerCheck(ports: Ports): MiddlewareHandler {
  return bearerAuth({
    verifyToken: (value) => tokenIsValid(ports, value),
    noAuthenticationHeader: { message: { error: "Authorization header missing" } },
    invalidAuthenticationHeader: {
      message: { error: "Authorization header is not a bearer token" },
    },
    invalidToken: { message: { error: "Unknown or revoked agent token" } },
  });
}

export function guard(ports: Ports): MiddlewareHandler {
  const bearer = bearerCheck(ports);
  const cross = csrf();

  const limit = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json({ error: "The request body is larger than 64 KiB" }, 413),
  });

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

    return limit(c, next);
  };
}
