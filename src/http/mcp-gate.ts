import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Context, MiddlewareHandler } from "hono";

import type { Ports } from "../core/ports.ts";
import { verifyToken } from "../core/tokens.ts";
import { bearerCheck } from "./guard.ts";

export interface McpEnv {
  Variables: { caller: AuthInfo };
}

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopbackHost(host: string): boolean {
  const url = URL.parse(`http://${host}`);

  return url !== null && url.host === host && LOOPBACK_HOSTNAMES.has(url.hostname);
}

function isLoopbackOrigin(origin: string): boolean {
  const url = URL.parse(origin);

  return url !== null && url.origin === origin && LOOPBACK_HOSTNAMES.has(url.hostname);
}

function hostAllowed(publicOrigin: string | null, host: string): boolean {
  const lowered = host.toLowerCase();

  return publicOrigin === null ? isLoopbackHost(lowered) : lowered === new URL(publicOrigin).host;
}

function originAllowed(publicOrigin: string | null, origin: string): boolean {
  return publicOrigin === null ? isLoopbackOrigin(origin) : origin === publicOrigin;
}

function refusalOf(c: Context, publicOrigin: string | null): Response | null {
  const hosts = [new URL(c.req.url).host, c.req.header("host")].filter(
    (host) => host !== undefined,
  );

  if (!hosts.every((host) => hostAllowed(publicOrigin, host))) {
    return c.json({ error: "Host not allowed" }, 403);
  }

  const origin = c.req.header("origin");

  if (origin !== undefined && !originAllowed(publicOrigin, origin)) {
    return c.json({ error: "Origin not allowed" }, 403);
  }

  if (c.req.header("authorization") === undefined) {
    return c.json({ error: "Send an agent token as a bearer token" }, 401, {
      "WWW-Authenticate": "Bearer",
    });
  }

  return null;
}

export function mcpGate(ports: Ports): MiddlewareHandler<McpEnv> {
  const { publicOrigin } = ports;

  const bearer = bearerCheck(async (value, c) => {
    const token = await verifyToken(ports, value);

    if (token === undefined) {
      return false;
    }

    c.set("caller", {
      token: value,
      clientId: `agent-token-${String(token.id)}`,
      scopes: [],
      extra: { name: token.name },
    });

    return true;
  });

  return async (c, next) => refusalOf(c, publicOrigin) ?? (await bearer(c, next));
}
