import type { Context } from "hono";

import type { PresentedToken } from "../core/access/bearer.ts";
import { UNKNOWN_TOKEN } from "../core/contract/agent-token-contract.ts";

const NOT_BEARER = "Authorization header is not a bearer token";

const CHALLENGES = {
  empty: 'Bearer realm=""',
  malformed: 'Bearer error="invalid_request"',
  unknown: 'Bearer error="invalid_token"',
} as const;

export function refusedBearer(
  c: Context,
  { kind }: Readonly<Exclude<PresentedToken, { readonly kind: "token" }>>,
): Response {
  const challenge = { "WWW-Authenticate": CHALLENGES[kind] };

  return kind === "unknown"
    ? c.json({ error: UNKNOWN_TOKEN }, 401, challenge)
    : c.json({ error: NOT_BEARER }, 400, challenge);
}
