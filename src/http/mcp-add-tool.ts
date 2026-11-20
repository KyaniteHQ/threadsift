import {
  type McpServer,
  type ScopeChallengeHandler,
  requireScopes,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import { pasteScopes } from "../core/agent-token-contract.ts";
import { refusalOf } from "../core/paste-refusal.ts";
import { pasteLink } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { savedView } from "./item-view.ts";
import { answered, guarded, refused } from "./mcp-results.ts";
import { SaveItemRequestSchema } from "./save-schemas.ts";
import { SavedItemResponseSchema } from "./schemas.ts";

const AddInputSchema = SaveItemRequestSchema.pick({ url: true, digest: true });

const DIGEST_ARGUMENT = "digest" satisfies keyof z.infer<typeof AddInputSchema>;

const AddCallSchema = z.object({ arguments: z.record(z.string(), z.unknown()) });

const addScopes: ScopeChallengeHandler = (call) => {
  const added = AddCallSchema.safeParse(call.request.params);
  const sendsDigest = added.success && DIGEST_ARGUMENT in added.data.arguments;

  return requireScopes(...pasteScopes(sendsDigest))(call);
};

export function registerAddTool(server: McpServer, ports: Ports, tokenId: number): void {
  server.registerTool(
    "add",
    {
      title: "Add a link",
      description:
        "Save a link as an Item. A link the library already holds is refreshed and does not count against the token's daily budget. Each new Item counts, and a token that has added its daily budget of Items gets an error until 00:00 UTC. The Item is `processing` until its fetch and Digest end, so read it again with `read`, or with `search` and `url`. `digest` is optional and publishes without a Provider call once the text is fetched.",
      inputSchema: AddInputSchema,
      outputSchema: SavedItemResponseSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      scopeChallenge: addScopes,
    },
    guarded("add", async ({ url, digest }: Readonly<z.infer<typeof AddInputSchema>>) => {
      const saved = await pasteLink(ports, url, { kind: "token", id: tokenId }, digest);

      if (saved.kind !== "saved") {
        const refusal = refusalOf(saved);

        return refusal.kind === "budget-spent"
          ? refused(refusal.body.error, { code: refusal.body.code, retryAfter: refusal.retryAfter })
          : refused(refusal.body.error);
      }

      return answered(SavedItemResponseSchema, savedView(saved.item));
    }),
  );
}
