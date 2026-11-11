import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { ITEMS_PAGE_SIZE, parseCursor } from "../core/item-page.ts";
import type { Ports } from "../core/ports.ts";
import { OverviewRetryResponseSchema, TopicPageSchema } from "../core/topic-overview-contract.ts";
import { readTopicPage } from "../core/topic-page.ts";
import { retryOverview } from "../core/topic-retry.ts";
import { NOT_FOUND } from "./item-routes.ts";
import { jsonBody } from "./openapi.ts";
import { ErrorResponseSchema, ItemQuerySchema } from "./schemas.ts";

const TopicParamSchema = z.object({ key: z.string().min(1).max(500) });

const TopicQuerySchema = ItemQuerySchema.pick({ cursor: true });

const getTopicRoute = createRoute({
  method: "get",
  path: "/api/topics/{key}",
  request: { params: TopicParamSchema, query: TopicQuerySchema },
  responses: {
    200: jsonBody(
      TopicPageSchema,
      `The Topic page. \`key\` in the path is a Topic name or its key, percent-encoded; a name made only of dots, or of \`~\` followed only by dots, takes one more leading \`~\` (\`.\` is sent as \`~.\`), because a path segment of dots is read as a directory step; the answer is the same for \`İstanbul\` and \`istanbul\`, because the lookup applies the key rule of the Topic and Tag filters. \`topic\` holds the key, the name as first spelled and the number of Items. \`items\` holds at most ${String(ITEMS_PAGE_SIZE)} Items of the Topic, newest saved first, each with its Source, its Digest title, its Summary, its saved date and whether the owner read it; \`inOverview\` is false for an Item whose Digest the overview was not built from yet. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged. \`overview.text\` is the agent's overview of up to 5 lines, or null; each line ends with the ids of the Items it comes from, as \`[12]\`, and \`cited\` gives the title of each cited Item that is still in the Topic. \`overview.builtFrom\` counts the Items of the Topic that the overview was built from. \`overview.state\` is \`pending\` while an overview run is queued or running, \`failed\` when the last run failed (\`failure\` names why) and \`idle\` otherwise. \`overview.provider\` is false when no Provider is saved, and then no overview is written.`,
    ),
    400: jsonBody(ErrorResponseSchema, "`cursor` is malformed: not `<saved date>.<id>`."),
    404: jsonBody(ErrorResponseSchema, "No Topic has this name or key."),
  },
});

const retryOverviewRoute = createRoute({
  method: "post",
  path: "/api/topics/{key}/overview",
  request: { params: TopicParamSchema },
  responses: {
    202: jsonBody(
      OverviewRetryResponseSchema,
      "An overview run is queued for the Topic, or one was already open. A failure from the last run is cleared. The Topic page shows the run as `pending` until it ends.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Topic has this name or key."),
    409: jsonBody(
      ErrorResponseSchema,
      "No overview can run: no Provider is saved, or the Topic has no Item with a Digest.",
    ),
  },
});

export function registerTopicRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(getTopicRoute, async (c) => {
    const { key } = c.req.valid("param");
    const { cursor } = c.req.valid("query");

    const page = await readTopicPage(
      ports.db,
      key,
      cursor === undefined ? null : parseCursor(cursor),
    );

    return page === undefined ? c.json({ error: NOT_FOUND }, 404) : c.json(page, 200);
  });

  app.openapi(retryOverviewRoute, async (c) => {
    const { key } = c.req.valid("param");
    const result = await retryOverview(ports, key);

    switch (result.outcome) {
      case "unknown-topic":
        return c.json({ error: NOT_FOUND }, 404);
      case "no-provider":
        return c.json({ error: "No Provider is saved" }, 409);
      case "no-items":
        return c.json({ error: "The Topic has no Item with a Digest" }, 409);
      case "started":
        return c.json({ overview: result.overview }, 202);
      default: {
        const exhaustive: never = result;

        return exhaustive;
      }
    }
  });
}
