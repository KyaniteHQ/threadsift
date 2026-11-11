import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";

import { itemPath } from "../core/item-path.ts";
import { paste } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { itemView } from "./item-view.ts";
import { answered, guarded, refused } from "./mcp-results.ts";
import { REFUSED_HOST, UPDATING } from "./save-route.ts";
import { SaveItemRequestSchema } from "./save-schemas.ts";
import { SavedItemResponseSchema } from "./schemas.ts";

const AddInputSchema = SaveItemRequestSchema.pick({ url: true, digest: true });

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
    },
    guarded("add", async ({ url, digest }: Readonly<z.infer<typeof AddInputSchema>>) => {
      const saved = await paste(ports, url, { digest });

      if (saved.kind === "refused") return refused(REFUSED_HOST);

      if (saved.kind === "updating") return refused(UPDATING);

      if (saved.kind !== "saved") throw new Error(`Paste answered ${saved.kind} without content`);

      return answered(SavedItemResponseSchema, {
        item: itemView(saved.item),
        url: itemPath(saved.item.id),
      });
    }),
  );
}
