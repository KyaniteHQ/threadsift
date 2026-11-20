import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../core/contract/error-wire.ts";
import { ItemResponseSchema, ReadStateRequestSchema } from "../core/contract/item-route-wire.ts";
import { setReadState } from "../core/item/read-state.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { access } from "./access.ts";
import { itemView } from "./item-view.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { notFound } from "./refusals.ts";
import { IdParamSchema } from "./route-input.ts";

const setReadStateRoute = createRoute({
  method: "put",
  path: "/api/items/{id}/read-state",
  middleware: access("owner"),
  request: { params: IdParamSchema, body: jsonRequest(ReadStateRequestSchema) },
  responses: {
    200: jsonBody(
      ItemResponseSchema,
      "The Item as the list shows it, with the Read state the owner set. Setting the state an Item already has changes nothing. Only the owner's session may call this; an agent token gets 403.",
    ),
    400: jsonBody(ErrorResponseSchema, "`readState` is not `read` or `unread`."),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

export function registerReadStateRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(setReadStateRoute, async (c) => {
    const item = await setReadState(
      ports.db,
      c.req.valid("param").id,
      c.req.valid("json").readState,
    );

    return item === undefined ? notFound(c) : c.json({ item: itemView(item) }, 200);
  });
}
