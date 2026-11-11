import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ITEMS_PAGE_SIZE } from "../core/item-page.ts";
import { parseLogCursor } from "../core/log-contract.ts";
import type { Ports } from "../core/ports.ts";
import { acceptProposal } from "../core/proposal-accept.ts";
import {
  AcceptedSchema,
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
      `One page of the open and accepting Proposals, newest first by \`id\`, at most ${String(ITEMS_PAGE_SIZE)}. Each has \`id\`, \`kind\` (\`tag-merge\`), \`state\` (\`open\`, or \`accepting\` while its merge runs), \`reason\` (the agent's one line) and \`from\` and \`into\`, the two Tags as \`{ id, name, items }\`, where \`items\` is the number of Items that carry the Tag now. \`POST /api/proposals/{id}/accept\` merges \`from\` into \`into\`. \`checkedAt\` is when the last weekly check started, in milliseconds, or null before the first one. \`provider\` is whether a Provider is saved; the check runs only then. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged.`,
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

const acceptProposalRoute = createRoute({
  method: "post",
  path: "/api/proposals/{id}/accept",
  request: { params: ProposalIdParamSchema },
  responses: {
    200: jsonBody(
      AcceptedSchema,
      "The merge finished in this request: every Item carries `into` and the `from` Tag is gone, and a Pin keeps it from coming back. Only the owner's session may accept; an agent token gets 403.",
    ),
    202: jsonBody(
      AcceptedSchema,
      "The merge started and units remain. The state is `accepting`, and the next scheduled tick finishes it.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Proposal has this id."),
    409: jsonBody(
      ErrorResponseSchema,
      "The Proposal is not open (`not-open`), or another Proposal is accepting (`merge-busy`): one merge runs at a time.",
    ),
  },
});

function registerList(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listProposalsRoute, async (c) => {
    const { cursor } = c.req.valid("query");

    return c.json(
      await readProposalPage(ports.db, cursor === undefined ? null : parseLogCursor(cursor)),
      200,
    );
  });
}

function registerAccept(app: OpenAPIHono, ports: Ports): void {
  app.openapi(acceptProposalRoute, async (c) => {
    const { id } = c.req.valid("param");
    const outcome = await acceptProposal(ports.db, Number(id));

    switch (outcome) {
      case "done":
        return c.json({ state: "done" as const }, 200);
      case "accepting":
        return c.json({ state: "accepting" as const }, 202);
      case "unknown":
        return c.json({ error: NOT_FOUND }, 404);
      case "not-open":
      case "merge-busy":
        return c.json({ error: outcome }, 409);
      default: {
        const exhaustive: never = outcome;

        return exhaustive;
      }
    }
  });
}

function registerReject(app: OpenAPIHono, ports: Ports): void {
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

export function registerProposalRoutes(app: OpenAPIHono, ports: Ports): void {
  registerList(app, ports);
  registerAccept(app, ports);
  registerReject(app, ports);
}
