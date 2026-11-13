import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { Caller } from "../core/caller.ts";
import type { Scope } from "../core/kinds.ts";
import { type NeededScopes, lacksScope, missingScope, pasteScopes } from "../core/scopes.ts";

type Principal =
  | { readonly kind: "owner" }
  | { readonly kind: "token"; readonly id: number; readonly scopes: readonly Scope[] }
  | { readonly kind: "anonymous" };

const SIGN_IN = "Sign in or send an agent token";

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

    case "anonymous":
      throw new HTTPException(401, { message: SIGN_IN });
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
    case "anonymous":
      throw new HTTPException(401, { message: SIGN_IN });
    default:
      return principal satisfies never;
  }
}
