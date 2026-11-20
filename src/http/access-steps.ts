import type { MiddlewareHandler } from "hono";
import { csrf } from "hono/csrf";

import type { Scope } from "../core/contract/agent-token-contract.ts";
import type { AiTaskRow } from "../core/kernel/ai-task-state.ts";
import { presentedToken } from "../features/access/core/bearer.ts";
import { challengeOf, refusedBearer } from "./bearer.ts";
import type { CacheKind } from "./response-headers.ts";
import { ownerHasSession } from "./session-cookie.ts";
import { requireScopes } from "./token-scopes.ts";

export interface CallbackEnv {
  Variables: { callbackTask: AiTaskRow };
}

export type Ctx = Parameters<MiddlewareHandler>[0];

type Needs = "owner" | Scope;

export interface Plan {
  readonly credentials: Needs | null;
  readonly csrf: boolean;
  readonly after: "next" | "credential";
  readonly cache: CacheKind | null;
}

const NOT_FOR_TOKENS = "Agent tokens cannot use this route";

const cross = csrf();

async function credentials(c: Ctx, needs: Needs): Promise<Response | undefined> {
  const authorization = c.req.header("authorization");

  if (authorization !== undefined) {
    const presented = await presentedToken(c.get("ports"), authorization);

    if (presented.kind !== "token") return refusedBearer(c, presented);

    c.set("principal", { kind: "token", id: presented.token.id, scopes: presented.token.scopes });

    if (needs === "owner") {
      return c.json({ error: NOT_FOR_TOKENS }, 403);
    }

    requireScopes(c, [needs]);

    return undefined;
  }

  if (await ownerHasSession(c, c.get("ports"))) {
    c.set("principal", { kind: "owner" });

    return undefined;
  }

  return c.json({ error: "Sign in or send an agent token" }, 401, challengeOf("missing"));
}

export async function admit(
  c: Ctx,
  { credentials: needs, csrf: checksOrigin }: Readonly<Plan>,
): Promise<Response | undefined> {
  const refusal = needs === null ? undefined : await credentials(c, needs);

  const carriesToken = needs !== null && c.req.header("authorization") !== undefined;

  if (refusal === undefined && checksOrigin && !carriesToken) {
    await cross(c, async () => {});
  }

  return refusal;
}
