import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import { presentedToken } from "../core/bearer.ts";
import { type OriginPolicy, originPolicyOf, unlistedPart } from "../core/own-origin.ts";
import type { Ports } from "../core/ports.ts";
import { refusedBearer } from "./bearer.ts";
import { senderOf } from "./sender.ts";

export interface McpEnv {
  Variables: { caller: AuthInfo };
}

export const McpExtraSchema = z.object({ tokenId: z.number().int() });

function refusalOf(c: Context, policy: Readonly<OriginPolicy>): Response | null {
  const part = unlistedPart(policy, senderOf(c));

  if (part === "host") return c.json({ error: "Host not allowed" }, 403);

  return part === "origin" ? c.json({ error: "Origin not allowed" }, 403) : null;
}

export function mcpGate(ports: Ports): MiddlewareHandler<McpEnv> {
  const policy = originPolicyOf(ports.config.publicOrigin);

  return async (c, next) => {
    const refusal = refusalOf(c, policy);

    if (refusal !== null) return refusal;

    const authorization = c.req.header("authorization");

    if (authorization === undefined) {
      return c.json({ error: "Send an agent token as a bearer token" }, 401, {
        "WWW-Authenticate": "Bearer",
      });
    }

    const presented = await presentedToken(ports, authorization);

    if (presented.kind !== "token") return refusedBearer(c, presented);

    c.set("caller", {
      token: presented.value,
      clientId: `agent-token-${String(presented.token.id)}`,
      scopes: [...presented.token.scopes],
      extra: { tokenId: presented.token.id },
    });

    return next();
  };
}
