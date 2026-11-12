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
      `One page of the open and accepting Proposals, newest first by \`id\`, at most ${String(ITEMS_PAGE_SIZE)}. Each has \`id\`, \`kind\` and \`state\` (\`open\`, or \`accepting\` while a merge runs). A \`tag-merge\` or \`topic-merge\` row has \`reason\` (the agent's one line) and \`from\` and \`into\`, the two Tags or the two Topics as \`{ id, name, items }\`, where \`items\` is the number of Items that carry the Tag, or sit under the Topic, now. A \`highlight-lost\` row has \`highlight\`, \`{ id, quote, item }\`: \`quote\` is the text the owner kept, and \`item\` is \`{ id, source, title }\` for the Item it belongs to, where \`title\` is the Digest title, else the fetched title, or null. It is listed only while the Highlight is not found in its Item's text. An \`overview-gap\` row has \`topic\`, \`{ key, name, uncovered, items }\`: \`items\` is the number of Items under the Topic that have a Digest, and \`uncovered\` is how many of them the Topic's overview was not built from, both counted now. It is listed only while \`uncovered\` is above 0 and no overview run is open for the Topic. An \`items-disagree\` row has \`reason\` (the agent's one line), \`topic\` as \`{ key, name }\`, and \`first\` and \`second\`, the two Items as \`{ id, title, summary }\`, \`first\` the one with the lower id: \`title\` is the Digest title and \`summary\` the stored Summary, both read live. It is listed only while both Items still have the Digest the pair was judged on and sit under one Topic. \`POST /api/proposals/{id}/accept\` merges \`from\` into \`into\` for a merge, removes the Highlight for a \`highlight-lost\` row, and starts the Topic's overview run for an \`overview-gap\` row. \`checkedAt\` is when the most recent weekly check (the Tag check, the Topic check, the Highlight check, the overview check or the disagreement check) started, in milliseconds, or null before the first one. \`provider\` is whether a Provider is saved; the weekly checks run only then. Only the kinds this release knows are listed. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged.`,
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
      "The Proposal is rejected. It leaves the list. Its pair of Tags, Topics or Items, its Highlight, or its Topic's overview, is never suggested again, and a rejected Highlight stays as it is. Only the owner's session may reject; an agent token gets 403.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Proposal of a kind this release knows has this id."),
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
      "The merge finished in this request: every Item carries `into` and the `from` Tag or Topic is gone, and a Pin keeps it from coming back. A Topic merge also tries once to open an overview run for `into`. For a `highlight-lost` row the Highlight and its search part are removed with the Proposal, and a second call answers 404. For an `items-disagree` row the pair was kept as a Pin and the Proposal was deleted in one write, no model ran, and a second call answers 404. For an `overview-gap` row one overview run was queued for the Topic, the Topic page's failure marker was cleared and the Proposal was deleted in one write, and a second call answers 404; the run reads at most 40 uncovered Items and starts the next run itself after a success until every Item is covered, so covering N Items takes at least ceil(N / 40) successful model calls, and a failed run stops the chain. Only the owner's session may accept; an agent token gets 403.",
    ),
    202: jsonBody(
      AcceptedSchema,
      "The merge started and units remain. The state is `accepting`, and the next scheduled tick finishes it.",
    ),
    404: jsonBody(
      ErrorResponseSchema,
      "No Proposal of a kind this release knows has this id. A row of a kind a later release stores answers 404 here and on reject, and is not listed.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "The Proposal is not open (`not-open`); the row is not current (`not-current`: the row stays and the list stops showing it), because the Highlight of a `highlight-lost` row is found in its Item again, the Topic of an `overview-gap` row has no Item left that its overview was not built from or already has an overview run open, or an `items-disagree` row names an Item that has a newer Digest or the two Items no longer sit under one Topic; no Provider is saved for an `overview-gap` row (`no-provider`: the row stays open); another Proposal is accepting (`merge-busy`: one merge runs at a time); or an overview run or another merge holds the lease of one of the two Topics (`topic-busy`: a Topic merge only; the Proposal stays open and the call can be sent again).",
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
    const outcome = await acceptProposal(ports, Number(id));

    switch (outcome) {
      case "done":
        return c.json({ state: "done" as const }, 200);
      case "accepting":
        return c.json({ state: "accepting" as const }, 202);
      case "unknown":
        return c.json({ error: NOT_FOUND }, 404);
      case "not-open":
      case "not-current":
      case "no-provider":
      case "merge-busy":
      case "topic-busy":
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
