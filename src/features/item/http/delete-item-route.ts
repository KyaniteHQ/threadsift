import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { deleteItem } from "../../../core/compose/delete-item.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { accessNote, accessRefusals, jsonBody, noContent } from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { IdParamSchema } from "../../../http/route-input.ts";

const DELETE_ITEM = access("delete");

const deleteItemRoute = createRoute({
  method: "delete",
  path: "/api/items/{id}",
  middleware: DELETE_ITEM,
  description: `Delete an Item. ${accessNote(DELETE_ITEM)}`,
  request: { params: IdParamSchema },
  responses: {
    ...accessRefusals(DELETE_ITEM),
    204: noContent(
      "The Item is deleted with its Digest, Tag links, search entries, jobs, AI tasks and files. Topics and Tags stay in the lists. A file that could not be removed is left to the cleanup, and the answer is still 204.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

export function registerDeleteItemRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(deleteItemRoute, async (c) =>
    (await deleteItem(ports, c.req.valid("param").id)) ? c.body(null, 204) : notFound(c),
  );
}
