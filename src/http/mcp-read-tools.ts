import { type McpServer, requireScopes } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { Ports } from "../core/ports.ts";
import { readItem, readItemPage } from "./item-read.ts";
import { answered, guarded, refused } from "./mcp-results.ts";
import { NOT_FOUND } from "./refusals.ts";
import { ItemDetailResponseSchema, ItemQuerySchema, ItemReadResponseSchema } from "./schemas.ts";

const READ_ONLY = requireScopes("read");

const ReadInputSchema = z.object({ id: z.number().int().positive() });

export function registerReadTools(server: McpServer, ports: Ports): void {
  server.registerTool(
    "search",
    {
      title: "Search Items",
      description:
        "List Items of the library, newest saved first, 50 to a page. Every filter is optional. `q` matches words in the title, post text, Summary and Tags. Send `next` from the answer as `cursor`, with the same filters, to read the following page. `counts` is present only without a `cursor`. Read an Item in full with `read`.",
      inputSchema: ItemQuerySchema,
      outputSchema: ItemReadResponseSchema,
      annotations: { readOnlyHint: true },
      scopeChallenge: READ_ONLY,
    },
    guarded("search", async (query) =>
      answered(ItemReadResponseSchema, await readItemPage(ports, query)),
    ),
  );

  server.registerTool(
    "read",
    {
      title: "Read an Item",
      description:
        "Read one Item by `id`: its status, post text, Digest, Kept comments, Highlights and Note.",
      inputSchema: ReadInputSchema,
      outputSchema: ItemDetailResponseSchema,
      annotations: { readOnlyHint: true },
      scopeChallenge: READ_ONLY,
    },
    guarded("read", async ({ id }) => {
      const read = await readItem(ports, id);

      return read === undefined ? refused(NOT_FOUND) : answered(ItemDetailResponseSchema, read);
    }),
  );
}
