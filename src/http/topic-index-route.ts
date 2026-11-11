import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { ITEMS_PAGE_SIZE } from "../core/item-page.ts";
import type { Ports } from "../core/ports.ts";
import { TopicIndexSchema } from "../core/topic-index-contract.ts";
import { readTopicIndex } from "../core/topic-index.ts";
import { TOPIC_KEY_MAX } from "../core/topic-overview-contract.ts";
import { jsonBody } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const IndexQuerySchema = z.object({ cursor: z.string().max(TOPIC_KEY_MAX).optional() });

const listTopicsRoute = createRoute({
  method: "get",
  path: "/api/topics",
  request: { query: IndexQuerySchema },
  responses: {
    200: jsonBody(
      TopicIndexSchema,
      `One page of the Index: at most ${String(ITEMS_PAGE_SIZE)} \`topics\`, every Topic once, ascending by \`key\`. \`key\` is the Topic's catalog key, which \`/api/topics/{key}\` takes after the percent-encoding and the dots rule described there; \`name\` is the spelling it was first saved with; \`itemCount\` is the number of Items linked to it, 0 for a Topic whose Items were all deleted; \`overviewLine\` is the first line of the stored overview with its \`[12]\`-style marks removed, or null when the Topic has no overview. \`total\` is the number of Topics. \`next\` is the \`key\` to send back as \`cursor\` for the following page, or null on the last page. The order compares keys byte by byte, so it is not a sort for any one language.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `\`cursor\` is longer than ${String(TOPIC_KEY_MAX)} characters.`,
    ),
  },
});

export function registerTopicIndexRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listTopicsRoute, async (c) => {
    const { cursor } = c.req.valid("query");

    return c.json(await readTopicIndex(ports.db, cursor ?? null), 200);
  });
}
