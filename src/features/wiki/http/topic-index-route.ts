import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { CATALOG_KEY_MAX } from "../../../core/contract/catalog-key-limit.ts";
import { PAGE_SIZE } from "../../../core/contract/paging.ts";
import { TopicIndexSchema } from "../../../core/contract/topic-index-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody, accessNote, accessRefusals } from "../../../http/openapi.ts";
import { readTopicIndex } from "../core/topic-index.ts";

const IndexQuerySchema = z.object({ cursor: z.string().max(CATALOG_KEY_MAX).optional() });

const READER = access("read");

const listTopicsRoute = createRoute({
  method: "get",
  path: "/api/topics",
  middleware: READER,
  description: accessNote(READER),
  request: { query: IndexQuerySchema },
  responses: {
    ...accessRefusals(READER),
    200: jsonBody(
      TopicIndexSchema,
      `One page of the Index: at most ${String(PAGE_SIZE)} \`topics\`, every Topic once, ascending by \`key\`. \`key\` is the Topic's catalog key, which \`/api/topics/{key}\` takes after the percent-encoding and the dots rule described there; \`name\` is the spelling it was first saved with; \`itemCount\` is the number of Items linked to it, 0 for a Topic whose Items were all deleted; \`overviewLine\` is the first line of the stored overview with its \`[12]\`-style marks removed, or null when the Topic has no overview. \`total\` is the number of Topics. \`next\` is the \`key\` to send back as \`cursor\` for the following page, or null on the last page. The order compares keys byte by byte, so it is not a sort for any one language.`,
    ),
  },
});

export function registerTopicIndexRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listTopicsRoute, async (c) => {
    const { cursor } = c.req.valid("query");

    return c.json(await readTopicIndex(ports.db, cursor ?? null), 200);
  });
}
