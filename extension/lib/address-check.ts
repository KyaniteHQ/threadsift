import { CallerScopesResponseSchema } from "../../src/core/contract/access-wire.ts";
import { type NeededScopes, missingScope } from "../../src/core/contract/agent-token-contract.ts";
import { ErrorResponseSchema } from "../../src/core/contract/error-wire.ts";
import { type Config, instanceAnswer, instanceRequest } from "./config.ts";
import type { Reach } from "./state.ts";

const RefusalSchema = ErrorResponseSchema.pick({ error: true });

const EXTENSION_SCOPES = ["read", "add"] as const satisfies NeededScopes;

async function refusalReach(response: Response, reach: Reach): Promise<Reach> {
  return (await instanceAnswer(response, RefusalSchema)) === null ? "not-instance" : reach;
}

async function reachOf(response: Response): Promise<Reach> {
  if (response.type === "opaqueredirect") return "not-instance";

  switch (response.status) {
    case 200: {
      const held = await instanceAnswer(response, CallerScopesResponseSchema);

      if (held === null) return "not-instance";

      return missingScope(held.scopes, EXTENSION_SCOPES) === undefined ? "works" : "scope-refused";
    }

    case 401:
      return refusalReach(response, "token-refused");
    case 403:
      return refusalReach(response, "scope-refused");
    default:
      return response.status >= 500 ? "check-failed" : "not-instance";
  }
}

export async function checkAddress(config: Readonly<Config> | null): Promise<Reach> {
  if (config === null) return "check-failed";

  const reply = await instanceRequest(config, "/api/scopes", {
    method: "GET",
    event: "address-check-failed",
    redirect: "manual",
  });

  return reply.kind === "unreached" ? reply.cause : reachOf(reply.response);
}
