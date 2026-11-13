import {
  type McpServer,
  type ScopeChallengeHandler,
  requireScopes,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import { paste } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { pasteScopes } from "../core/scopes.ts";
import { savedView } from "./item-view.ts";
import { answered, guarded, refused } from "./mcp-results.ts";
import { REFUSED_HOST, UPDATING } from "./refusals.ts";
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

export function registerAddTool(server: McpServer, ports: Ports): void {
  server.registerTool(
    "add",
    {
      title: "Add a link",
      description:
        "Save a link as an Item. A link the library already holds is refreshed. The Item is `processing` until its fetch and Digest end, so read it again with `read`, or with `search` and `url`. `digest` is optional and publishes without a Provider call once the text is fetched.",
      inputSchema: AddInputSchema,
      outputSchema: SavedItemResponseSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      scopeChallenge: addScopes,
    },
    guarded("add", async ({ url, digest }: Readonly<z.infer<typeof AddInputSchema>>) => {
      const saved = await paste(ports, url, { digest });

      if (saved.kind === "refused") return refused(REFUSED_HOST);

      if (saved.kind === "updating") return refused(UPDATING);

      if (saved.kind !== "saved") throw new Error(`Paste answered ${saved.kind} without content`);

      return answered(SavedItemResponseSchema, savedView(saved.item));
    }),
  );
}
