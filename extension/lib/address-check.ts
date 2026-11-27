import { CallerScopesResponseSchema } from "../../src/core/contract/access-wire.ts";
import {
  type NeededScopes,
  UNKNOWN_TOKEN,
  lacksScope,
  missingScope,
} from "../../src/core/contract/agent-token-contract.ts";
import { ErrorResponseSchema, NOT_FOUND } from "../../src/core/contract/error-wire.ts";
import { type Config, instanceRequest } from "./config.ts";
import type { AddressCheck } from "./state.ts";

const RefusalSchema = ErrorResponseSchema.pick({ error: true });

const EXTENSION_SCOPES = ["read", "add"] as const satisfies NeededScopes;

const REFUSAL_CHECKS: ReadonlyMap<number, readonly [string, AddressCheck]> = new Map([
  [401, [UNKNOWN_TOKEN, "token-refused"]],
  [403, [lacksScope("read"), "scope-refused"]],
  [404, [NOT_FOUND, "instance-outdated"]],
]);

type Reply =
  | { readonly kind: "scopes"; readonly scopes: readonly string[] }
  | { readonly kind: "refusal"; readonly error: string }
  | { readonly kind: "other" }
  | { readonly kind: "unread"; readonly check: AddressCheck };

function replyOf(text: string): Reply {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "other" };
  }

  const held = CallerScopesResponseSchema.safeParse(json);

  if (held.success) return { kind: "scopes", scopes: held.data.scopes };

  const refusal = RefusalSchema.safeParse(json);

  return refusal.success ? { kind: "refusal", error: refusal.data.error } : { kind: "other" };
}

async function replyFrom(response: Response): Promise<Reply> {
  try {
    return replyOf(await response.text());
  } catch (thrown) {
    const timedOut = thrown instanceof DOMException && thrown.name === "TimeoutError";

    return { kind: "unread", check: timedOut ? "timed-out" : "check-failed" };
  }
}

function checkOfReply(status: number, reply: Readonly<Reply>): AddressCheck {
  if (reply.kind === "unread") return reply.check;

  if (status === 200 && reply.kind === "scopes") {
    return missingScope(reply.scopes, EXTENSION_SCOPES) === undefined ? "works" : "scope-refused";
  }

  const expected = REFUSAL_CHECKS.get(status);

  if (expected === undefined || reply.kind !== "refusal") return "not-instance";

  const [error, check] = expected;

  return reply.error === error ? check : "not-instance";
}

async function checkOf(response: Response): Promise<AddressCheck> {
  if (response.type === "opaqueredirect") return "not-instance";

  if (response.status >= 500) return "check-failed";

  return checkOfReply(response.status, await replyFrom(response));
}

export async function checkAddress(config: Readonly<Config>): Promise<AddressCheck> {
  const outcome = await instanceRequest(config, "/api/scopes", {
    method: "GET",
    event: "address-check-failed",
    redirect: "manual",
  });

  if (outcome.kind === "answered") return checkOf(outcome.response);

  return outcome.failure === "unknown" ? "unreachable" : outcome.failure;
}
