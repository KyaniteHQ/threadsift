import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import { BatchRequestSchema, BatchResponseSchema } from "../../../core/contract/batch-wire.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  BATCH_LINKS_MAX,
  IMPORT_CURSOR_MAX,
  IMPORT_NAME_MAX,
} from "../../../core/contract/import-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { savedView } from "../../../http/item-view.ts";
import {
  accessNote,
  accessRefusals,
  budgetRefusal,
  jsonBody,
  jsonRequest,
  restoringResponse,
} from "../../../http/openapi.ts";
import { refusing } from "../../../http/refusals.ts";
import { callerOf, requirePasteScopes } from "../../../http/token-scopes.ts";
import { pasteLinksThenSaveCursor, type BatchEntry } from "../core/batch-paste.ts";
import { refusalOf } from "../core/paste-refusal.ts";

const BATCH_DIGEST_SCOPE =
  " An entry with a `digest` needs the `digest` scope as well, and the call saves nothing without it.";

const BATCH = access("add");

const batchRoute = createRoute({
  method: "post",
  path: "/api/items/batch",
  middleware: BATCH,
  description: `Save many links in one call and, optionally, keep a cursor on the Instance. \`links\` holds 1 to ${String(BATCH_LINKS_MAX)} entries of \`url\` and optionally \`digest\`, with the rules of \`POST /api/items\`; an entry takes no \`content\`, \`page\` or \`fill\`. The links are saved one after the other, in the order given. \`results[i]\` answers \`links[i]\`: \`added\` (a new Item, with its \`item\` and \`url\` as \`POST /api/items\` answers them), \`known\` (the library already holds the link, so it is not fetched again, gets no new Digest and keeps the Digest sent with it unused; \`POST /api/items\` refreshes it) or \`refused\` (the host is not globally reachable; \`url\` is the link sent). A refused link does not stop the others. \`import\` is \`{name, cursor}\`: \`name\` is 1 to ${String(IMPORT_NAME_MAX)} characters of letters, digits, \`.\`, \`_\` and \`-\` that the caller chooses, and \`cursor\` is an opaque text of 1 to ${String(IMPORT_CURSOR_MAX)} characters, such as the last bookmark id. The Instance saves \`cursor\` under \`name\` only after every link has an outcome, so a call that dies half way leaves the old cursor and the caller sends the same links again, and the repeat answers \`known\` for the links already saved. \`import.previous\` is optional: with null, the Instance saves \`cursor\` only while nothing is stored; without it, always. A text \`previous\` comes with \`import.previousUpdatedAt\`, the \`updatedAt\` that \`GET /api/imports/{name}\` answered with that cursor, and the Instance saves \`cursor\` only while the stored cursor equals \`previous\` and the stored \`updatedAt\` equals \`previousUpdatedAt\`. Every save gives the row a new \`updatedAt\`, so a cursor that left \`previous\` and came back to it does not match, and a late call cannot move the cursor back. A text \`previous\` without \`previousUpdatedAt\`, a \`previousUpdatedAt\` with \`previous\` null or absent, and another key in \`import\` answer 400 and save nothing. The answer holds the \`import\` the Instance stores after the call, which is not the one sent when the guard did not match, or null when the call sent none or \`previous\` was a text and nothing is stored. \`GET /api/imports/{name}\` reads the cursor back. ${accessNote(BATCH, BATCH_DIGEST_SCOPE)}`,
  request: { body: jsonRequest(BatchRequestSchema) },
  responses: {
    ...accessRefusals(BATCH, BATCH_DIGEST_SCOPE),
    ...budgetRefusal(
      "The count is checked once before the first save. If the token lacks budget for every possibly new link, nothing is saved and the import cursor stays. The batch is not checked again when a held link is deleted or midnight passes. Two concurrent requests can both pass the check and exceed the limit by one request's links.",
    ),
    200: jsonBody(
      BatchResponseSchema,
      "Every link has an outcome in `results`, in the order sent. The cursor is saved when its guard matches, and `import` holds the cursor the Instance stores.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `The error names the field it refuses: the entry's index, as \`links.2.url\`, or \`import\` for an \`import\` the rules above refuse. Nothing is saved and the cursor stays.`,
    ),
    503: restoringResponse("nothing is saved and the cursor stays."),
  },
});

function resultOf(entry: Readonly<BatchEntry>) {
  if (entry.outcome === "refused") return entry;

  return { ...savedView(entry.item), outcome: entry.outcome };
}

export function registerBatchRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(batchRoute, async (c) => {
    const { links, import: cursor } = c.req.valid("json");

    requirePasteScopes(
      c,
      links.some(({ digest }) => digest !== undefined),
    );

    const pasted = await pasteLinksThenSaveCursor(ports, links, callerOf(c), cursor);

    if (pasted.kind !== "done") return refusing(c, refusalOf(pasted));

    return c.json({ results: pasted.entries.map(resultOf), import: pasted.import }, 200);
  });
}
