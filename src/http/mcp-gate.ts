import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Context, MiddlewareHandler } from "hono";

import type { Ports } from "../core/ports.ts";
import { verifyToken } from "../core/tokens.ts";
import { bearerCheck } from "./guard.ts";

export interface McpEnv {
  Variables: { caller: AuthInfo };
}

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

const AUTHORITY = /^(?<name>\[[0-9a-f:.]+\]|[^\s/?#@[\]:]+)(?::(?<port>\d{1,5}))?$/u;

const MAX_PORT = 65_535;

interface OriginPolicy {
  readonly publicOrigin: string | null;
  readonly publicHost: string | null;
  readonly defaultPort: string;
}

function isLoopbackOrigin(origin: string): boolean {
  const url = URL.parse(origin);

  return url !== null && url.origin === origin && LOOPBACK_HOSTNAMES.has(url.hostname);
}

function hostAllowed({ publicHost, defaultPort }: Readonly<OriginPolicy>, host: string): boolean {
  const groups = AUTHORITY.exec(host.toLowerCase())?.groups;

  if (groups === undefined) {
    return false;
  }

  const { name = "", port } = groups;
  const portNumber = port === undefined ? undefined : Number(port);

  if (portNumber !== undefined && (portNumber < 1 || portNumber > MAX_PORT)) {
    return false;
  }

  if (publicHost === null) {
    return LOOPBACK_HOSTNAMES.has(name);
  }

  const bare = portNumber === undefined || String(portNumber) === defaultPort;

  return (bare ? name : `${name}:${String(portNumber)}`) === publicHost;
}

function originAllowed(publicOrigin: string | null, origin: string): boolean {
  return publicOrigin === null ? isLoopbackOrigin(origin) : origin === publicOrigin;
}

function refusalOf(c: Context, policy: Readonly<OriginPolicy>): Response | null {
  const hosts = [new URL(c.req.url).host, c.req.header("host")].filter(
    (host) => host !== undefined,
  );

  if (!hosts.every((host) => hostAllowed(policy, host))) {
    return c.json({ error: "Host not allowed" }, 403);
  }

  const origin = c.req.header("origin");

  if (origin !== undefined && !originAllowed(policy.publicOrigin, origin)) {
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

  const publicUrl = publicOrigin === null ? null : new URL(publicOrigin);

  const policy: OriginPolicy = {
    publicOrigin,
    publicHost: publicUrl?.host ?? null,
    defaultPort: publicUrl?.protocol === "https:" ? "443" : "80",
  };

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

  return async (c, next) => refusalOf(c, policy) ?? (await bearer(c, next));
}
