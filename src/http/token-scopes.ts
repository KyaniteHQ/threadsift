import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import {
  type Scope,
  type NeededScopes,
  lacksScope,
  missingScope,
  pasteScopes,
} from "../core/agent-token-contract.ts";
import type { Caller } from "../core/caller.ts";

type Principal =
  | { readonly kind: "owner" }
  | { readonly kind: "token"; readonly id: number; readonly scopes: readonly Scope[] };

declare module "hono" {
  interface ContextVariableMap {
    principal: Principal;
  }
}

export function requireScopes(c: Context, needed: NeededScopes): void {
  const principal = c.get("principal");

  switch (principal.kind) {
    case "owner":
      return;
    case "token": {
      const missing = missingScope(principal.scopes, needed);

      if (missing !== undefined) {
        throw new HTTPException(403, { message: lacksScope(missing) });
      }

      return;
    }

    default:
      return principal satisfies never;
  }
}

export function requirePasteScopes(c: Context, sendsDigest: boolean): void {
  requireScopes(c, pasteScopes(sendsDigest));
}

export function callerOf(c: Context): Caller {
  const principal = c.get("principal");

  switch (principal.kind) {
    case "owner":
      return { kind: "owner" };
    case "token":
      return { kind: "token", id: principal.id };
    default:
      return principal satisfies never;
  }
}
