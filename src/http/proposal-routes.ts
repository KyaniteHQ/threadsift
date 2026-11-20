import type { OpenAPIHono } from "@hono/zod-openapi";

import { ProposalPageSchema } from "../core/contract/proposal-contract.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { acceptProposal, rejectProposal } from "../core/wiki/proposal-decision.ts";
import { readProposalPage, readProposalState } from "../core/wiki/proposal-page.ts";
import {
  acceptProposalRoute,
  listProposalsRoute,
  proposalStateRoute,
  rejectProposalRoute,
} from "./proposal-route-spec.ts";
import { notFound } from "./refusals.ts";

function registerList(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listProposalsRoute, async (c) => {
    const { cursor } = c.req.valid("query");

    return c.json(ProposalPageSchema.parse(await readProposalPage(ports.db, cursor ?? null)), 200);
  });
}

function registerState(app: OpenAPIHono, ports: Ports): void {
  app.openapi(proposalStateRoute, async (c) => {
    const state = await readProposalState(ports.db, Number(c.req.valid("param").id));

    return state === undefined ? notFound(c) : c.json({ state }, 200);
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
        return notFound(c);
      case "not-open":
      case "not-current":
      case "no-provider":
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
