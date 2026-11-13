import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { ITEMS_PAGE_SIZE } from "../core/item-page.ts";
import { LogPageSchema, parseLogCursor } from "../core/log-contract.ts";
import { readLog } from "../core/log-page.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody } from "./openapi.ts";
import { ErrorResponseSchema, cursorParam } from "./schemas.ts";

const LogQuerySchema = z.object({ cursor: cursorParam(parseLogCursor) });

const listLogRoute = createRoute({
  method: "get",
  path: "/api/log",
  request: { query: LogQuerySchema },
  responses: {
    200: jsonBody(
      LogPageSchema,
      `One page of the Log: at most ${String(ITEMS_PAGE_SIZE)} \`entries\`, newest first by \`id\`, which only grows. \`startedAt\` is when the Log began, in milliseconds. Each entry has \`id\`, \`at\` (milliseconds) and an \`action\`, and the rest follows the action. \`ingest\` and \`digest\` carry \`item\` (\`id\` and the Digest title when the entry was written), \`topic\` (\`key\` and the name when written) and \`tags\`. \`topic\` carries \`topic\`. \`overview\` carries \`topic\`, \`added\` and \`removed\`. \`related\` carries \`item\` and \`picks\`. \`merge\` carries \`from\` and \`into\`, the two Tag names as written when the merge finished, and \`items\`, the number of Items that carried \`from\`. \`merge-topic\` carries the same three fields for two Topics. A title, name or Tag shows what the entry recorded and never changes; \`item.id\` and \`topic.key\` open the Item and the Topic page as they are now. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`cursor` is not a decimal integer of 1 to 16 digits that is at most 9007199254740991.",
    ),
  },
});

export function registerLogRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listLogRoute, async (c) => {
    const { cursor = null } = c.req.valid("query");

    return c.json(await readLog(ports.db, cursor), 200);
  });
}
