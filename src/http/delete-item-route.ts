import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { deleteItem } from "../core/delete-item.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody, noContent, scopeNote, scopeRefusal } from "./openapi.ts";
import { notFound } from "./refusals.ts";
import { ErrorResponseSchema, IdParamSchema } from "./schemas.ts";

const deleteItemRoute = createRoute({
  method: "delete",
  path: "/api/items/{id}",
  description: `Delete an Item.${scopeNote("DELETE", "/api/items/{id}")}`,
  request: { params: IdParamSchema },
  responses: {
    ...scopeRefusal("DELETE", "/api/items/{id}"),
    204: noContent(
      "The Item is deleted with its Digest, Tag links, search entries, jobs, AI tasks and files. Topics and Tags stay in the lists. A file that could not be removed is left to the cleanup, and the answer is still 204.",
    ),
    400: jsonBody(ErrorResponseSchema, "`id` is not a positive integer. Nothing is deleted."),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

export function registerDeleteItemRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(deleteItemRoute, async (c) =>
    (await deleteItem(ports, c.req.valid("param").id)) ? c.body(null, 204) : notFound(c),
  );
}
