import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import {
  ErrorResponseSchema,
  UnavailableResponseSchema,
} from "../../../core/contract/error-wire.ts";
import { SavedItemResponseSchema } from "../../../core/contract/item-route-wire.ts";
import { SaveItemRequestSchema, SaveRefusalSchema } from "../../../core/contract/save-wire.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { ITEM_CAP, access } from "../../../http/access.ts";
import { savedView } from "../../../http/item-view.ts";
import {
  PASTE_DIGEST_SCOPE,
  budgetRefusal,
  jsonBody,
  jsonRequest,
  scopeNote,
  scopeRefusal,
} from "../../../http/openapi.ts";
import { refusing } from "../../../http/refusals.ts";
import { callerOf, requirePasteScopes } from "../../../http/token-scopes.ts";
import { refusalOf } from "../core/paste-refusal.ts";
import { paste } from "../core/paste.ts";
import {
  SAVE_ITEM_DESCRIPTION,
  SAVE_ITEM_REFUSED,
  SAVE_ITEM_TOO_LARGE,
} from "./save-route-text.ts";

const SAVE_ITEM = access("add", { body: ITEM_CAP });

const saveItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  middleware: SAVE_ITEM,
  description: SAVE_ITEM_DESCRIPTION + scopeNote(SAVE_ITEM, PASTE_DIGEST_SCOPE),
  request: { body: jsonRequest(SaveItemRequestSchema) },
  responses: {
    401: jsonBody(ErrorResponseSchema, "The agent token is unknown or revoked."),
    ...scopeRefusal(SAVE_ITEM, PASTE_DIGEST_SCOPE),
    ...budgetRefusal("Nothing is saved."),
    201: jsonBody(
      SavedItemResponseSchema,
      "The link was new and is now an Item. The Item is `processing` until its fetch and Digest jobs end. Read `GET /api/items/{id}/status` until `status` leaves `processing`. A short link that cannot be resolved answers with its end state.",
    ),
    200: jsonBody(
      SavedItemResponseSchema,
      "An Item with the same normalized URL already existed. It is `processing` again and has a new fetch job, unless a job was already queued or running. With `page`, the open fetch job ends first, so the new job always publishes the page.",
    ),
    400: jsonBody(SaveRefusalSchema, SAVE_ITEM_REFUSED),
    413: jsonBody(ErrorResponseSchema, SAVE_ITEM_TOO_LARGE),
    409: jsonBody(
      ErrorResponseSchema,
      "`page` for a Reddit post or comment whose Item already holds a saved thread from `content`, which is a thread header and so also a thread with no comments or with no published Digest. The saved thread stays, with its Kept comments, and nothing changes. Also `fill: true` for a link whose Item holds a saved thread in that sense or does not exist.",
    ),
    503: jsonBody(
      UnavailableResponseSchema,
      "A restore is running (`code` is `restoring`), so the link is not saved. Reads and deletes work meanwhile. Send the link again when the restore has finished.",
    ),
  },
});

export function registerSaveRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(saveItemRoute, async (c) => {
    const { url, digest, content, page, fill } = c.req.valid("json");

    requirePasteScopes(c, digest !== undefined);

    const saved = await paste(ports, url, callerOf(c), { digest, content, page, fill });

    if (saved.kind !== "saved") return refusing(c, refusalOf(saved));

    return c.json(savedView(saved.item), saved.created ? 201 : 200);
  });
}
