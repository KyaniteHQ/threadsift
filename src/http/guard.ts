import type { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";

import type { Ports } from "../core/ports.ts";
import { tokenIsValid } from "../core/tokens.ts";
import { isOwnerOnly, isPublic } from "./access-rules.ts";
import { ownerHasSession } from "./session-cookie.ts";

export const BODY_LIMIT_BYTES = 64 * 1024;

type Caller = "owner" | "token";

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
    let caller: Caller | undefined;

    if (!isPublic(method, path)) {
      if (c.req.header("authorization") === undefined) {
        caller = (await ownerHasSession(c, ports)) ? "owner" : undefined;
      } else {
        await bearer(c, async () => {});
        caller = "token";
      }

      if (caller === undefined) {
        return c.json({ error: "Sign in or send an agent token" }, 401);
      }

      if (caller === "token" && isOwnerOnly(path)) {
        return c.json({ error: "Agent tokens cannot use this route" }, 403);
      }
    }

    await cross(c, async () => {});

    return limit(c, next);
  };
}
