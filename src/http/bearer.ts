import type { Context } from "hono";

import { UNKNOWN_TOKEN } from "../core/contract/agent-token-contract.ts";
import type { PresentedToken } from "../features/access/core/bearer.ts";

const NOT_BEARER = "Authorization header is not a bearer token";

export const CHALLENGES = {
  missing: "Bearer",
  unknown: 'Bearer error="invalid_token"',
} as const;

export function challengeOf(kind: keyof typeof CHALLENGES) {
  return { "WWW-Authenticate": CHALLENGES[kind] };
}

export function refusedBearer(
  c: Context,
  { kind }: Readonly<Exclude<PresentedToken, { readonly kind: "token" }>>,
): Response {
  return kind === "unknown"
    ? c.json({ error: UNKNOWN_TOKEN }, 401, challengeOf("unknown"))
    : c.json({ error: NOT_BEARER }, 401, challengeOf("missing"));
}
