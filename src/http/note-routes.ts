import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import {
  NoteConflictSchema,
  NoteResponseSchema,
  SaveNoteRequestSchema,
} from "../core/note-contract.ts";
import { saveNote } from "../core/notes.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { notFound } from "./refusals.ts";
import { ErrorResponseSchema, IdParamSchema } from "./schemas.ts";

const STALE =
  "The Note changed after it was read. The answer holds the current Note and its revision";

const saveNoteRoute = createRoute({
  method: "put",
  path: "/api/items/{id}/note",
  request: { params: IdParamSchema, body: jsonRequest(SaveNoteRequestSchema) },
  responses: {
    200: jsonBody(
      NoteResponseSchema,
      "The Note as this write left it, with the next `revision`. An empty or whitespace-only `body` clears the Note: `body` is then null and the revision still advances. Only the owner's session may call this; an agent token gets 403 and reads the Note in `GET /api/items/{id}`.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The body is not a `body` string and a `revision`, the `body` is longer than 10,000 code points or is not well-formed Unicode, or `id` is not a positive integer. Nothing is saved.",
    ),
    403: jsonBody(
      ErrorResponseSchema,
      "An agent token called this. Only the owner's session may call this.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
    409: jsonBody(
      NoteConflictSchema,
      "`revision` is not the Note's revision any more. Nothing is saved. `note` holds the current Note and revision: send the text again with that revision to replace it. A Note that was never saved has revision 0.",
    ),
    413: jsonBody(ErrorResponseSchema, "The request body is larger than 64 KiB."),
  },
});

export function registerNoteRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(saveNoteRoute, async (c) => {
    const saved = await saveNote(ports.db, c.req.valid("param").id, c.req.valid("json"));

    switch (saved.kind) {
      case "no-item":
        return notFound(c);
      case "stale":
        return c.json({ error: STALE, note: saved.note }, 409);
      case "saved":
        return c.json({ note: saved.note }, 200);
      default: {
        const exhaustive: never = saved;

        return exhaustive;
      }
    }
  });
}
