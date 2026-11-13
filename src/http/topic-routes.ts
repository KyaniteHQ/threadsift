import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ITEMS_PAGE_SIZE } from "../core/item-page.ts";
import type { Ports } from "../core/ports.ts";
import {
  OverviewRetryResponseSchema,
  TopicKeyParamSchema,
  TopicPageSchema,
} from "../core/topic-overview-contract.ts";
import { readTopicPage } from "../core/topic-page.ts";
import { retryOverview } from "../core/topic-retry.ts";
import { jsonBody, scopeNote, scopeRefusal } from "./openapi.ts";
import { notFound } from "./refusals.ts";
import { ErrorResponseSchema, ItemQuerySchema } from "./schemas.ts";

const TopicQuerySchema = ItemQuerySchema.pick({ cursor: true });

const getTopicRoute = createRoute({
  method: "get",
  path: "/api/topics/{key}",
  request: { params: TopicKeyParamSchema, query: TopicQuerySchema },
  responses: {
    200: jsonBody(
      TopicPageSchema,
      `The Topic page. \`key\` in the path is a Topic name or its key, percent-encoded; a name made only of dots, or of \`~\` followed only by dots, takes one more leading \`~\` (\`.\` is sent as \`~.\`), because a path segment of dots is read as a directory step; the answer is the same for \`İstanbul\` and \`istanbul\`, because the lookup applies the key rule of the Topic and Tag filters. \`topic\` holds the key, the name as first spelled and the number of Items. \`items\` holds at most ${String(ITEMS_PAGE_SIZE)} Items of the Topic, newest saved first, each with its Source, its Digest title, its Summary, its saved date and whether the owner read it; \`inOverview\` is false for an Item whose Digest the overview was not built from yet. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged. \`overview.text\` is the agent's overview of up to 5 lines, or null; each line ends with the ids of the Items it comes from, as \`[12]\`, and \`cited\` gives the title of each cited Item that is still in the Topic. \`overview.builtFrom\` counts the Items of the Topic that the overview was built from. \`overview.state\` is \`pending\` while an overview run is queued or running, \`failed\` when the last run failed (\`failure\` names why) and \`idle\` otherwise. \`overview.provider\` is false when no Provider is saved, and then no overview is written. \`disagreements\` lists the pairs of Items of this Topic that the owner accepted as a disagreement on the Proposals page, the last accepted first and at most 20, each with its \`id\`, the agent's \`reason\` and both Items (\`id\` and Digest \`title\`); an entry leaves the list while either Item has a newer Digest or sits in another Topic, and comes back when the Items are as they were.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `\`cursor\` is malformed: not \`<saved date>.<id>\`, or \`key\` is longer than the longest catalog key a Topic name can make.`,
    ),
    404: jsonBody(
      ErrorResponseSchema,
      "No Topic has this name or key, and no merged-away Topic had it.",
    ),
  },
});

const retryOverviewRoute = createRoute({
  method: "post",
  path: "/api/topics/{key}/overview",
  description: `Write the Topic page overview again.${scopeNote("POST", "/api/topics/{key}/overview")}`,
  request: { params: TopicKeyParamSchema },
  responses: {
    ...scopeRefusal("POST", "/api/topics/{key}/overview"),
    202: jsonBody(
      OverviewRetryResponseSchema,
      "An overview run is queued for the Topic, or one was already open. For the key of a merged-away Topic, it is queued for the Topic it was merged into. A failure marker is cleared when this call opens a run, or when the run it found open is still open. The Topic page shows the run as `pending` until it ends.",
    ),
    404: jsonBody(
      ErrorResponseSchema,
      "No Topic has this name or key, and no merged-away Topic had it.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "No overview can run: no Provider is saved, or the Topic has no Item with a Digest.",
    ),
  },
});

export function registerTopicRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(getTopicRoute, async (c) => {
    const { key } = c.req.valid("param");
    const { cursor = null } = c.req.valid("query");

    const page = await readTopicPage(ports.db, key, cursor);

    return page === undefined ? notFound(c) : c.json(page, 200);
  });

  app.openapi(retryOverviewRoute, async (c) => {
    const { key } = c.req.valid("param");
    const result = await retryOverview(ports, key);

    switch (result.outcome) {
      case "unknown-topic":
        return notFound(c);
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
