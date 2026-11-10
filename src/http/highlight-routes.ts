import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import {
  CreateHighlightRequestSchema,
  HighlightResponseSchema,
} from "../core/highlight-contract.ts";
import { createHighlight, removeHighlight } from "../core/highlights.ts";
import type { Ports } from "../core/ports.ts";
import { registerHighlightsPageRoute } from "./highlights-page-route.ts";
import { NOT_FOUND } from "./item-routes.ts";
import { jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { ErrorResponseSchema, HighlightParamsSchema, IdParamSchema } from "./schemas.ts";

const NO_COMMENT = "The thread the Reader shows has no such comment";

const STALE =
  "The text changed after it was read. Read GET /api/items/{id} again and select the passage again";

const MISMATCH = "selector: it does not match the text of that revision";

const OWNER_ONLY = "Only the owner's session may call this; an agent token gets 403.";

const createHighlightRoute = createRoute({
  method: "post",
  path: "/api/items/{id}/highlights",
  request: { params: IdParamSchema, body: jsonRequest(CreateHighlightRequestSchema) },
  responses: {
    201: jsonBody(
      HighlightResponseSchema,
      `The Highlight is saved and \`attached\`, with the id the server chose. ${OWNER_ONLY}`,
    ),
    200: jsonBody(
      HighlightResponseSchema,
      "The same passage of the same revision was already saved as an attached Highlight; this is that Highlight and nothing changed.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The body is not a target, a revision and a selector, the quote is empty or not well-formed Unicode, or the selector does not match the text of that revision: `exact` must stand at `hint` (counted in code points) in the text of the target, with the up to 32 code points before it as `prefix` and the up to 32 after it as `suffix`. Nothing is saved.",
    ),
    403: jsonBody(ErrorResponseSchema, `An agent token called this. ${OWNER_ONLY}`),
    404: jsonBody(
      ErrorResponseSchema,
      "No Item has this id, or the thread the Reader shows has no comment with the target's `commentId`.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "`revision` is not the revision of the target any more, because a refresh or a new Digest changed the text. Nothing is saved. Read `GET /api/items/{id}`, take `highlights.revisions.post` (or `.comments` for a comment) and the text it shows, and select the passage again.",
    ),
    413: jsonBody(ErrorResponseSchema, "The request body is larger than 64 KiB."),
  },
});

const removeHighlightRoute = createRoute({
  method: "delete",
  path: "/api/items/{id}/highlights/{highlightId}",
  request: { params: HighlightParamsSchema },
  responses: {
    204: noContent(
      `The Highlight and its search entry are removed. ${OWNER_ONLY} A second delete of the same ids answers 404.`,
    ),
    400: jsonBody(ErrorResponseSchema, "`id` or `highlightId` is not a positive integer."),
    403: jsonBody(ErrorResponseSchema, `An agent token called this. ${OWNER_ONLY}`),
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
        return c.json({ error: NOT_FOUND }, 404);
      case "no-comment":
        return c.json({ error: NO_COMMENT }, 404);
      case "stale":
        return c.json({ error: STALE }, 409);
      case "mismatch":
        return c.json({ error: MISMATCH }, 400);
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

    return (await removeHighlight(ports.db, id, highlightId))
      ? c.body(null, 204)
      : c.json({ error: NOT_FOUND }, 404);
  });

  registerHighlightsPageRoute(app, ports);
}
