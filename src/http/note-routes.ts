import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { groupedNumber } from "../core/format.ts";
import {
  NoteConflictSchema,
  NoteResponseSchema,
  SaveNoteRequestSchema,
  NOTE_MAX_CODE_POINTS,
} from "../core/note-contract.ts";
import { saveNote } from "../core/notes.ts";
import type { Ports } from "../core/ports.ts";
import { DEFAULT_CAP, access, tooLarge } from "./access.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { notFound } from "./refusals.ts";
import { ErrorResponseSchema, IdParamSchema } from "./schemas.ts";

const STALE =
  "The Note changed after it was read. The answer holds the current Note and its revision";

const saveNoteRoute = createRoute({
  method: "put",
  path: "/api/items/{id}/note",
  middleware: access("owner"),
  request: { params: IdParamSchema, body: jsonRequest(SaveNoteRequestSchema) },
  responses: {
    200: jsonBody(
      NoteResponseSchema,
      "The Note as this write left it, with the next `revision`. An empty or whitespace-only `body` clears the Note: `body` is then null and the revision still advances. Only the owner's session may call this; an agent token gets 403 and reads the Note in `GET /api/items/{id}`.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `The body is not a \`body\` string and a \`revision\`, the \`body\` is longer than ${groupedNumber(NOTE_MAX_CODE_POINTS)} code points or is not well-formed Unicode, or \`id\` is not a positive integer. Nothing is saved.`,
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
    413: jsonBody(ErrorResponseSchema, `${tooLarge(DEFAULT_CAP)}.`),
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
