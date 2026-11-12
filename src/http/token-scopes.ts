import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { Scope } from "../core/kinds.ts";
import { type NeededScopes, lacksScope, missingScope, pasteScopes } from "../core/scopes.ts";

export type Principal =
  | { readonly kind: "owner" }
  | { readonly kind: "token"; readonly scopes: readonly Scope[] }
  | { readonly kind: "anonymous" };

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
      throw new HTTPException(401, { message: "Sign in or send an agent token" });
    default:
      return principal satisfies never;
  }
}

export function requirePasteScopes(c: Context, sendsDigest: boolean): void {
  requireScopes(c, pasteScopes(sendsDigest));
}
