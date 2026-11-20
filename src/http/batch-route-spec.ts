import { createRoute } from "@hono/zod-openapi";

import { IMPORT_CURSOR_MAX, IMPORT_NAME_MAX } from "../core/import-contract.ts";
import { DEFAULT_CAP, access, tooLarge } from "./access.ts";
import { BATCH_LINKS_MAX, BatchRequestSchema, BatchResponseSchema } from "./batch-schemas.ts";
import { budgetRefusal, jsonBody, jsonRequest, scopeNote, scopeRefusal } from "./openapi.ts";
import { ErrorResponseSchema, UnavailableResponseSchema } from "./schemas.ts";

const BATCH_DIGEST_SCOPE =
  " An entry with a `digest` needs the `digest` scope as well, and the call saves nothing without it.";

export const BATCH = access("add");

export const batchRoute = createRoute({
  method: "post",
  path: "/api/items/batch",
  middleware: BATCH,
  description: `Save many links in one call and, optionally, keep a cursor on the Instance. \`links\` holds 1 to ${String(BATCH_LINKS_MAX)} entries of \`url\` and optionally \`digest\`, with the rules of \`POST /api/items\`; an entry takes no \`content\`, \`page\` or \`fill\`. The links are saved one after the other, in the order given. \`results[i]\` answers \`links[i]\`: \`added\` (a new Item, with its \`item\` and \`url\` as \`POST /api/items\` answers them), \`known\` (the library already holds the link, so it is not fetched again, gets no new Digest and keeps the Digest sent with it unused; \`POST /api/items\` refreshes it) or \`refused\` (the host is not globally reachable; \`url\` is the link sent). A refused link does not stop the others. \`import\` is \`{name, cursor}\`: \`name\` is 1 to ${String(IMPORT_NAME_MAX)} characters of letters, digits, \`.\`, \`_\` and \`-\` that the caller chooses, and \`cursor\` is an opaque text of 1 to ${String(IMPORT_CURSOR_MAX)} characters, such as the last bookmark id. The Instance saves \`cursor\` under \`name\` only after every link has an outcome, so a call that dies half way leaves the old cursor and the caller sends the same links again, and the repeat answers \`known\` for the links already saved. \`import.previous\` is optional: with a text, the Instance saves \`cursor\` only while the stored cursor equals it; with null, only while nothing is stored; without it, always. A caller whose earlier call may still be running sends it, so the older call cannot move the cursor back. The answer holds the \`import\` the Instance stores after the call, which is not the one sent when \`previous\` did not match, or null when the call sent none or \`previous\` was a text and nothing is stored. \`GET /api/imports/{name}\` reads the cursor back.${scopeNote(BATCH, BATCH_DIGEST_SCOPE)}`,
  request: { body: jsonRequest(BatchRequestSchema) },
  responses: {
    401: jsonBody(ErrorResponseSchema, "The agent token is unknown or revoked."),
    ...scopeRefusal(BATCH, BATCH_DIGEST_SCOPE),
    ...budgetRefusal(
      "The count is checked once before the first save. If the token lacks budget for every possibly new link, nothing is saved and the import cursor stays. The batch is not checked again when a held link is deleted or midnight passes. Two concurrent requests can both pass the check and exceed the limit by one request's links.",
    ),
    200: jsonBody(
      BatchResponseSchema,
      "Every link has an outcome in `results`, in the order sent, and the cursor is saved.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `\`links\` is empty or holds more than ${String(BATCH_LINKS_MAX)} entries, an entry is not an absolute http or https URL with an optional Digest or has a key besides \`url\` and \`digest\`, or \`import\` is malformed. The error names the entry's index, as \`links.2.url\`. Nothing is saved and the cursor stays.`,
    ),
    413: jsonBody(ErrorResponseSchema, `${tooLarge(DEFAULT_CAP)}.`),
    503: jsonBody(
      UnavailableResponseSchema,
      "While a restore runs (`code` is `restoring`), nothing is saved.",
    ),
  },
});
