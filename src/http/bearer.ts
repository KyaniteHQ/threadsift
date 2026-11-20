import type { Context } from "hono";

import { UNKNOWN_TOKEN } from "../core/contract/agent-token-contract.ts";
import type { PresentedToken } from "../features/access/core/bearer.ts";

const NOT_BEARER = "Authorization header is not a bearer token";

const CHALLENGES = {
  missing: "Bearer",
  empty: 'Bearer realm=""',
  malformed: 'Bearer error="invalid_request"',
  unknown: 'Bearer error="invalid_token"',
} as const;

export function challengeOf(kind: keyof typeof CHALLENGES) {
  return { "WWW-Authenticate": CHALLENGES[kind] };
}

export function refusedBearer(
  c: Context,
  { kind }: Readonly<Exclude<PresentedToken, { readonly kind: "token" }>>,
): Response {
  const challenge = challengeOf(kind);

  return kind === "unknown"
    ? c.json({ error: UNKNOWN_TOKEN }, 401, challenge)
    : c.json({ error: NOT_BEARER }, 400, challenge);
}
