import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { type BatchEntry, pasteBatch } from "../core/batch-paste.ts";
import {
  ImportNameSchema,
  ImportStateSchema,
  readImport,
  saveImport,
} from "../core/import-cursor.ts";
import { itemPath } from "../core/item-path.ts";
import type { Ports } from "../core/ports.ts";
import { BATCH_LINKS_MAX, BatchRequestSchema, BatchResponseSchema } from "./batch-schemas.ts";
import { itemView } from "./item-view.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { UPDATING } from "./save-route.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const NO_IMPORT = "No cursor is saved under this name";

const batchRoute = createRoute({
  method: "post",
  path: "/api/items/batch",
  description: `Save many links in one call and, optionally, keep a cursor on the Instance. \`links\` holds 1 to ${String(BATCH_LINKS_MAX)} entries of \`url\` and optionally \`digest\`, with the rules of \`POST /api/items\`; an entry takes no \`content\`, \`page\` or \`fill\`. The links are saved one after the other, in the order given. \`results[i]\` answers \`links[i]\`: \`added\` (a new Item, with its \`item\` and \`url\` as \`POST /api/items\` answers them), \`known\` (the library already holds the link, so it is not fetched again, gets no new Digest and keeps the Digest sent with it unused; \`POST /api/items\` refreshes it) or \`refused\` (the host is not globally reachable; \`url\` is the link sent). A refused link does not stop the others. \`import\` is \`{name, cursor}\`: \`name\` is 1 to 64 characters of letters, digits, \`.\`, \`_\` and \`-\` that the caller chooses, and \`cursor\` is an opaque text of 1 to 256 characters, such as the last bookmark id. The Instance saves \`cursor\` under \`name\` only after every link has an outcome, so a call that dies half way leaves the old cursor and the caller sends the same links again, and the repeat answers \`known\` for the links already saved. The answer repeats the saved \`import\`, or null when the call sent none. \`GET /api/imports/{name}\` reads the cursor back.`,
  request: { body: jsonRequest(BatchRequestSchema) },
  responses: {
    200: jsonBody(
      BatchResponseSchema,
      "Every link has an outcome in `results`, in the order sent, and the cursor is saved.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `\`links\` is empty or holds more than ${String(BATCH_LINKS_MAX)} entries, an entry is not an absolute http or https URL with an optional Digest or has a key besides \`url\` and \`digest\`, or \`import\` is malformed. The error names the entry's index, as \`links.2.url\`. Nothing is saved and the cursor stays.`,
    ),
    413: jsonBody(ErrorResponseSchema, "The request body is larger than 64 KiB."),
    503: jsonBody(
      ErrorResponseSchema,
      "A new release is rewriting the stored Items and has not finished, so the link it reached is not saved. Links before it stay saved and the cursor does not move. Send the call again after a minute.",
    ),
  },
});

const getImportRoute = createRoute({
  method: "get",
  path: "/api/imports/{name}",
  request: {
    params: z.object({ name: ImportNameSchema }),
  },
  responses: {
    200: jsonBody(
      ImportStateSchema,
      "The cursor the last batch call saved under this name, and when it saved it in milliseconds.",
    ),
    400: jsonBody(ErrorResponseSchema, "`name` is not 1 to 64 letters, digits, `.`, `_` and `-`."),
    404: jsonBody(ErrorResponseSchema, "No batch call saved a cursor under this name."),
  },
});

function resultOf(entry: Readonly<BatchEntry>) {
  if (entry.outcome === "refused") return entry;

  return { item: itemView(entry.item), url: itemPath(entry.item.id), outcome: entry.outcome };
}

export function registerBatchRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(batchRoute, async (c) => {
    const { links, import: cursor } = c.req.valid("json");
    const pasted = await pasteBatch(ports, links);

    if (pasted.kind === "updating") return c.json({ error: UPDATING }, 503);

    const saved = cursor === undefined ? null : await saveImport(ports.db, cursor);

    return c.json({ results: pasted.entries.map(resultOf), import: saved }, 200);
  });

  app.openapi(getImportRoute, async (c) => {
    const found = await readImport(ports.db, c.req.valid("param").name);

    return found === undefined ? c.json({ error: NO_IMPORT }, 404) : c.json(found, 200);
  });
}
