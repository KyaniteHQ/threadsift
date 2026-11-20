import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  NoteConflictSchema,
  NoteResponseSchema,
  SaveNoteRequestSchema,
} from "../../../core/contract/note-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { accessNote, accessRefusals, jsonBody, jsonRequest } from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { IdParamSchema } from "../../../http/route-input.ts";
import { saveNote } from "../core/notes.ts";

const STALE =
  "The Note changed after it was read. The answer holds the current Note and its revision";

const OWNER = access("owner");

const saveNoteRoute = createRoute({
  method: "put",
  path: "/api/items/{id}/note",
  middleware: OWNER,
  description: accessNote(OWNER, " An agent token reads the Note in `GET /api/items/{id}`."),
  request: { params: IdParamSchema, body: jsonRequest(SaveNoteRequestSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      NoteResponseSchema,
      "The Note as this write left it, with the next `revision`. An empty or whitespace-only `body` clears the Note: `body` is then null and the revision still advances.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
    409: jsonBody(
      NoteConflictSchema,
      "`revision` is not the Note's revision any more. Nothing is saved. `note` holds the current Note and revision: send the text again with that revision to replace it. A Note that was never saved has revision 0.",
    ),
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
