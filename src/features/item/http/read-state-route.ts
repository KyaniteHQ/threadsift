import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  ItemResponseSchema,
  ReadStateRequestSchema,
} from "../../../core/contract/item-route-wire.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { itemView } from "../../../http/item-view.ts";
import { accessNote, accessRefusals, jsonBody, jsonRequest } from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { IdParamSchema } from "../../../http/route-input.ts";
import { setReadState } from "../core/read-state.ts";

const OWNER = access("owner");

const setReadStateRoute = createRoute({
  method: "put",
  path: "/api/items/{id}/read-state",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { params: IdParamSchema, body: jsonRequest(ReadStateRequestSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      ItemResponseSchema,
      "The Item as the list shows it, with the Read state the owner set. Setting the state an Item already has changes nothing.",
    ),
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
