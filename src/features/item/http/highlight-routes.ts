import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { CONTEXT_CODE_POINTS } from "../../../core/contract/highlight-anchor.ts";
import {
  CreateHighlightRequestSchema,
  HighlightResponseSchema,
  SELECTOR_MISMATCH,
  SelectorMismatchSchema,
} from "../../../core/contract/highlight-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import {
  accessNote,
  accessRefusals,
  jsonBody,
  jsonRequest,
  noContent,
} from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { HighlightParamsSchema, IdParamSchema } from "../../../http/route-input.ts";
import { createHighlight, removeHighlight } from "../core/highlights.ts";
import { registerHighlightsPageRoute } from "./highlights-page-route.ts";

const NO_COMMENT = "The thread the Reader shows has no such comment";

const STALE =
  "The text changed after it was read. Read GET /api/items/{id} again and select the passage again";

const MISMATCH = "selector: it does not match the text of that revision";

const OWNER = access("owner");

const createHighlightRoute = createRoute({
  method: "post",
  path: "/api/items/{id}/highlights",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { params: IdParamSchema, body: jsonRequest(CreateHighlightRequestSchema) },
  responses: {
    ...accessRefusals(OWNER),
    201: jsonBody(
      HighlightResponseSchema,
      `The Highlight is saved and \`attached\`, with the id the server chose.`,
    ),
    200: jsonBody(
      HighlightResponseSchema,
      "The same passage of the same revision was already saved as an attached Highlight; this is that Highlight and nothing changed.",
    ),
    400: jsonBody(
      z.union([ErrorResponseSchema, SelectorMismatchSchema]),
      `The selector does not match the text of that revision: \`exact\` must stand at \`hint\` (counted in code points) in the text of the target, with the up to ${String(CONTEXT_CODE_POINTS)} code points before it as \`prefix\` and the up to ${String(CONTEXT_CODE_POINTS)} after it as \`suffix\`. Nothing is saved, and \`code\` is \`selector-mismatch\`.`,
    ),
    404: jsonBody(
      ErrorResponseSchema,
      "No Item has this id, or the thread the Reader shows has no comment with the target's `commentId`.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "`revision` is not the revision of the target any more, because a refresh or a new Digest changed the text. Nothing is saved. Read `GET /api/items/{id}`, take `highlights.revisions.post` (or `.comments` for a comment) and the text it shows, and select the passage again.",
    ),
  },
});

const removeHighlightRoute = createRoute({
  method: "delete",
  path: "/api/items/{id}/highlights/{highlightId}",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { params: HighlightParamsSchema },
  responses: {
    ...accessRefusals(OWNER),
    204: noContent(
      `The Highlight and its search entry are removed. A second delete of the same ids answers 404.`,
    ),
    404: jsonBody(
      ErrorResponseSchema,
      "No Highlight with this `highlightId` belongs to the Item with this `id`.",
    ),
  },
});

export function registerHighlightRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(createHighlightRoute, async (c) => {
    const created = await createHighlight(ports, c.req.valid("param").id, c.req.valid("json"));

    switch (created.kind) {
      case "no-item":
        return notFound(c);
      case "no-comment":
        return c.json({ error: NO_COMMENT }, 404);
      case "stale":
        return c.json({ error: STALE }, 409);
      case "mismatch":
        return c.json({ error: MISMATCH, code: SELECTOR_MISMATCH }, 400);
      case "existing":
        return c.json({ highlight: created.highlight }, 200);
      case "created":
        return c.json({ highlight: created.highlight }, 201);
      default: {
        const exhaustive: never = created;

        return exhaustive;
      }
    }
  });

  app.openapi(removeHighlightRoute, async (c) => {
    const { id, highlightId } = c.req.valid("param");

    return (await removeHighlight(ports.db, id, highlightId)) ? c.body(null, 204) : notFound(c);
  });

  registerHighlightsPageRoute(app, ports);
}
