import type { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";

import {
  BODY_LIMIT_BYTES,
  ITEM_REQUEST_BYTES,
  RESTORE_PART_BYTES,
  RESULT_BODY_BYTES,
} from "../core/limits.ts";
import type { Ports } from "../core/ports.ts";
import { UNKNOWN_TOKEN, verifyToken } from "../core/tokens.ts";
import {
  isIntakeCallback,
  isOwnerOnly,
  isPublic,
  isTaskCallback,
  requiredScope,
} from "./access-rules.ts";
import { ownerHasSession } from "./session-cookie.ts";
import { requireScopes } from "./token-scopes.ts";

function capAt(maxSize: number, size: string) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: `The request body is larger than ${size}` }, 413),
  });
}

export const bodyCap = capAt(BODY_LIMIT_BYTES, "64 KiB");

const itemCap = capAt(ITEM_REQUEST_BYTES, "8 MiB");

const resultCap = capAt(RESULT_BODY_BYTES, "256 KiB");

const partCap = capAt(RESTORE_PART_BYTES, "the part size");

const PART_PATH = /^\/api\/restore\/[^/]+\/parts\/[^/]+$/u;

function capFor(method: string, path: string): MiddlewareHandler {
  if (method === "PUT" && PART_PATH.test(path)) return partCap;

  if (isIntakeCallback(method, path) || (method === "POST" && path === "/api/items")) {
    return itemCap;
  }

  return isTaskCallback(method, path) ? resultCap : bodyCap;
}

const NOT_BEARER = "Authorization header is not a bearer token";

const NOT_FOR_TOKENS = "Agent tokens cannot use this route";

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

export function guard(ports: Ports): MiddlewareHandler {
  const bearer = bearerCheck(async (value, c) => {
    const token = await verifyToken(ports, value);

    if (token === undefined) {
      return false;
    }

    c.set("principal", { kind: "token", id: token.id, scopes: token.scopes });

    return true;
  });

  const cross = csrf();

  return async (c, next) => {
    const { method, path } = c.req;
    const protectedRoute = !isPublic(method, path);
    const carriesToken = protectedRoute && c.req.header("authorization") !== undefined;

    if (protectedRoute) {
      if (carriesToken) {
        await bearer(c, async () => {});

        const scope = requiredScope(method, path);

        if (isOwnerOnly(path) || scope === undefined) {
          return c.json({ error: NOT_FOR_TOKENS }, 403);
        }

        requireScopes(c, [scope]);
      } else if (await ownerHasSession(c, ports)) {
        c.set("principal", { kind: "owner" });
      } else {
        return c.json({ error: "Sign in or send an agent token" }, 401);
      }
    }

    if (!carriesToken) {
      await cross(c, async () => {});
    }

    return capFor(method, path)(c, next);
  };
}
