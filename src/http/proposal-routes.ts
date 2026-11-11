import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ITEMS_PAGE_SIZE } from "../core/item-page.ts";
import { parseLogCursor } from "../core/log-contract.ts";
import type { Ports } from "../core/ports.ts";
import {
  ProposalIdParamSchema,
  ProposalPageSchema,
  ProposalQuerySchema,
  RejectedSchema,
} from "../core/proposal-contract.ts";
import { readProposalPage, rejectProposal } from "../core/proposal-page.ts";
import { NOT_FOUND } from "./item-routes.ts";
import { jsonBody } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const listProposalsRoute = createRoute({
  method: "get",
  path: "/api/proposals",
  request: { query: ProposalQuerySchema },
  responses: {
    200: jsonBody(
      ProposalPageSchema,
      `One page of the open Proposals, newest first by \`id\`, at most ${String(ITEMS_PAGE_SIZE)}. Each has \`id\`, \`kind\` (\`tag-merge\`), \`state\` (\`open\`), \`reason\` (the agent's one line) and \`from\` and \`into\`, the two Tags as \`{ id, name, items }\`, where \`items\` is the number of Items that carry the Tag now. Merging \`from\` into \`into\` is only suggested: nothing here accepts it. \`checkedAt\` is when the last weekly check started, in milliseconds, or null before the first one. \`provider\` is whether a Provider is saved; the check runs only then. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`cursor` is not a decimal integer of 1 to 16 digits that is at most 9007199254740991.",
    ),
  },
});

const rejectProposalRoute = createRoute({
  method: "post",
  path: "/api/proposals/{id}/reject",
  request: { params: ProposalIdParamSchema },
  responses: {
    200: jsonBody(
      RejectedSchema,
      "The Proposal is rejected. It leaves the list and its pair of Tags is never suggested again, whichever way round. Only the owner's session may reject; an agent token gets 403.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Proposal has this id."),
    409: jsonBody(
      ErrorResponseSchema,
      "The Proposal is not open, so it cannot be rejected. The `error` is `not-open`.",
    ),
  },
});

export function registerProposalRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listProposalsRoute, async (c) => {
    const { cursor } = c.req.valid("query");

    return c.json(
      await readProposalPage(ports.db, cursor === undefined ? null : parseLogCursor(cursor)),
      200,
    );
  });

  app.openapi(rejectProposalRoute, async (c) => {
    const { id } = c.req.valid("param");
    const outcome = await rejectProposal(ports.db, Number(id));

    switch (outcome) {
      case "rejected":
        return c.json({ state: "rejected" as const }, 200);
      case "unknown":
        return c.json({ error: NOT_FOUND }, 404);
      case "not-open":
        return c.json({ error: "not-open" }, 409);
      default: {
        const exhaustive: never = outcome;

        return exhaustive;
      }
    }
  });
}
