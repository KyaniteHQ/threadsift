import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { setReadState } from "../core/read-state.ts";
import { NOT_FOUND } from "./item-routes.ts";
import { itemView } from "./item-view.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import {
  ErrorResponseSchema,
  IdParamSchema,
  ItemResponseSchema,
  ReadStateRequestSchema,
} from "./schemas.ts";

const setReadStateRoute = createRoute({
  method: "put",
  path: "/api/items/{id}/read-state",
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

    return item === undefined
      ? c.json({ error: NOT_FOUND }, 404)
      : c.json({ item: itemView(item) }, 200);
  });
}
