import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { PAGE_SIZE, parseNumberCursor } from "../../../core/contract/paging.ts";
import {
  type AcceptRefusal,
  AcceptedSchema,
  ProposalPageSchema,
  ProposalStateSchema,
  RejectedSchema,
} from "../../../core/contract/proposal-contract.ts";
import { ADDED_READ_LIMIT } from "../../../core/contract/topic-overview-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { accessNote, accessRefusals, jsonBody } from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { IdParamSchema, cursorParam } from "../../../http/route-input.ts";
import { acceptProposal, rejectProposal } from "../core/proposal-decision.ts";
import { readProposalPage, readProposalState } from "../core/proposal-page.ts";

const ProposalQuerySchema = z.object({ cursor: cursorParam(parseNumberCursor) });

const READER = access("read");

const OWNER = access("owner");

const listProposalsRoute = createRoute({
  method: "get",
  path: "/api/proposals",
  middleware: READER,
  description: accessNote(READER),
  request: { query: ProposalQuerySchema },
  responses: {
    ...accessRefusals(READER),
    200: jsonBody(
      ProposalPageSchema,
      `One page of the open and accepting Proposals, newest first by \`id\`, at most ${String(PAGE_SIZE)}. Each has \`id\`, \`kind\` and \`state\` (\`open\`, or \`accepting\` while a merge runs). A \`tag-merge\` or \`topic-merge\` row has \`reason\` (the agent's one line) and \`from\` and \`into\`, the two Tags or the two Topics as \`{ id, name, items }\`, where \`items\` is the number of Items that carry the Tag, or sit under the Topic, now. A merge row also has \`failedRuns\`, how many runs failed to apply the merge since the last unit committed, counted while the row is \`accepting\` and 0 for an \`open\` row. The server log holds a \`merge-unit-failed\` line with the Proposal's id, the error class and, for a database error, its code. A \`highlight-lost\` row has \`highlight\`, \`{ id, quote, item }\`: \`quote\` is the text the owner kept, and \`item\` is \`{ id, source, title }\` for the Item it belongs to, where \`title\` is the Digest title, else the fetched title, or null. It is listed only while the Highlight is not found in its Item's text. An \`overview-gap\` row has \`topic\`, \`{ key, name, uncovered, items }\`: \`items\` is the number of Items under the Topic that have a Digest, and \`uncovered\` is how many of them the Topic's overview was not built from, both counted now. It is listed only while \`uncovered\` is above 0 and no overview run is open for the Topic. An \`items-disagree\` row has \`reason\` (the agent's one line), \`topic\` as \`{ key, name }\`, and \`first\` and \`second\`, the two Items as \`{ id, title, summary }\`, \`first\` the one with the lower id: \`title\` is the Digest title and \`summary\` the stored Summary, both read live. It is listed only while both Items still have the Digest the pair was judged on and sit under one Topic. \`POST /api/proposals/{id}/accept\` merges \`from\` into \`into\` for a merge, removes the Highlight for a \`highlight-lost\` row, and starts the Topic's overview run for an \`overview-gap\` row. \`checkedAt\` is when the most recent weekly check (the Tag check, the Topic check, the Highlight check, the overview check or the disagreement check) started, in milliseconds, or null before the first one. \`provider\` is whether a Provider is saved; the weekly checks run only then. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged.`,
    ),
  },
});

const proposalStateRoute = createRoute({
  method: "get",
  path: "/api/proposals/{id}",
  middleware: READER,
  description: accessNote(READER),
  request: { params: IdParamSchema },
  responses: {
    ...accessRefusals(READER),
    200: jsonBody(
      ProposalStateSchema,
      "The stored `state` of the Proposal: `open`, `accepting`, `rejected` or `declined`. It answers for a row the list hides, such as an `open` disagreement whose Items sit in two Topics, and for a rejected or declined row, which the list never shows. A row that Accept removed has no state.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Proposal has this id."),
  },
});

const rejectProposalRoute = createRoute({
  method: "post",
  path: "/api/proposals/{id}/reject",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { params: IdParamSchema },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      RejectedSchema,
      "The Proposal is rejected. It leaves the list. Its pair of Tags, Topics or Items, its Highlight, or its Topic's overview, is never suggested again, and a rejected Highlight stays as it is.",
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
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { params: IdParamSchema },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      AcceptedSchema,
      `The merge finished while this request ran, by its own units or by the \`merges\` stage: every Item carries \`into\` and the \`from\` Tag or Topic is gone, and a Pin keeps it from coming back. A Topic merge also tries once to open an overview run for \`into\`. For a \`highlight-lost\` row the Highlight and its search part are removed with the Proposal, and a second call answers 404. For an \`items-disagree\` row the pair was kept as a Pin and the Proposal was deleted in one write, no model ran, and a second call answers 404. For an \`overview-gap\` row one overview run was queued for the Topic, the Topic page's failure marker was cleared and the Proposal was deleted in one write, and a second call answers 404; the run reads at most ${String(ADDED_READ_LIMIT)} uncovered Items and starts the next run itself after a success until every Item is covered, so covering N Items takes at least ceil(N / ${String(ADDED_READ_LIMIT)}) successful model calls, and a failed run stops the chain.`,
    ),
    202: jsonBody(
      AcceptedSchema,
      "The merge started and units remain. The state is `accepting`, and the next scheduled tick finishes it.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Proposal has this id."),
    409: jsonBody(
      ErrorResponseSchema,
      "The Proposal is not open (`not-open`); the row is not current (`not-current`: the subject changed, or a concurrent Accept already removed the row), because a concurrent Accept removed a lost-Highlight or disagreement row, the Highlight of a `highlight-lost` row is found in its Item again, the Topic of an `overview-gap` row has no Item left that its overview was not built from or already has an overview run open, or an `items-disagree` row names an Item that has a newer Digest or the two Items no longer sit under one Topic; no Provider is saved for an `overview-gap` row (`no-provider`: the row stays open); another Proposal is accepting (`merge-busy`: one merge runs at a time); while this request ran, a unit of the `merges` stage failed before the first unit of this merge committed, and the row is `open` again (`merge-failed`: Accept can run again).",
    ),
  },
});

function registerList(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listProposalsRoute, async (c) => {
    const { cursor } = c.req.valid("query");

    return c.json(ProposalPageSchema.parse(await readProposalPage(ports.db, cursor ?? null)), 200);
  });
}

function registerState(app: OpenAPIHono, ports: Ports): void {
  app.openapi(proposalStateRoute, async (c) => {
    const state = await readProposalState(ports.db, c.req.valid("param").id);

    return state === undefined ? notFound(c) : c.json({ state }, 200);
  });
}

function registerAccept(app: OpenAPIHono, ports: Ports): void {
  app.openapi(acceptProposalRoute, async (c) => {
    const { id } = c.req.valid("param");
    const outcome = await acceptProposal(ports, id);

    if (outcome === "done") return c.json({ state: "done" as const }, 200);

    if (outcome === "accepting") return c.json({ state: "accepting" as const }, 202);

    if (outcome === "unknown") return notFound(c);

    const refusal: AcceptRefusal = outcome;

    return c.json({ error: refusal }, 409);
  });
}

function registerReject(app: OpenAPIHono, ports: Ports): void {
  app.openapi(rejectProposalRoute, async (c) => {
    const { id } = c.req.valid("param");
    const outcome = await rejectProposal(ports.db, id);

    switch (outcome) {
      case "rejected":
        return c.json({ state: "rejected" as const }, 200);
      case "unknown":
        return notFound(c);
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
  registerState(app, ports);
  registerAccept(app, ports);
  registerReject(app, ports);
}
