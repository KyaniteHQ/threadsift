import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { retryDigest } from "../core/digest-retry.ts";
import { itemFilters } from "../core/item-filters.ts";
import { getListedItem, listItems } from "../core/item-selection.ts";
import type { Ports } from "../core/ports.ts";
import { itemView, shownItems } from "./item-view.ts";
import { jsonBody } from "./openapi.ts";
import { registerSaveRoute } from "./save-route.ts";
import {
  ErrorResponseSchema,
  IdParamSchema,
  ItemListResponseSchema,
  ItemQuerySchema,
  ItemResponseSchema,
} from "./schemas.ts";

export const NOT_FOUND = "Not found";

const listItemsRoute = createRoute({
  method: "get",
  path: "/api/items",
  request: { query: ItemQuerySchema },
  responses: {
    200: jsonBody(
      ItemListResponseSchema,
      "The Items that match every filter given, newest saved first, without their post text. Read `GET /api/items/{id}` for the text. `image` is the Item's first stored image, as its file-route path and alt text, or null. `q` matches Items that hold every word it contains, as the start of a word, in the title, post text, Summary or Tags; `topic` and `tag` match a Topic or Tag name with case and spacing ignored. `url` keeps only the Item whose normalized URL is the one of the link given, so another form of the same link finds it. `fillable` is true for a Reddit post or comment Item that holds no saved thread. `counts` holds the library totals, and for each Source, Read state, Topic and Tag the number of Items a choice leaves given the other filters.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`source` or `read` is not one of the listed values, `url` is not an absolute http or https link, or `q` is longer than 200 characters.",
    ),
  },
});

const getItemStatusRoute = createRoute({
  method: "get",
  path: "/api/items/{id}/status",
  request: { params: IdParamSchema },
  responses: {
    200: jsonBody(
      ItemResponseSchema,
      "The Item as the list shows it, without its post text and posted date. Poll this until `status` leaves `processing`.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

const retryDigestRoute = createRoute({
  method: "post",
  path: "/api/items/{id}/digest",
  request: { params: IdParamSchema },
  responses: {
    200: jsonBody(
      ItemResponseSchema,
      "Queue a Digest over stored text, or return the unchanged Item when a Digest is already open or no text exists.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

export function registerItemRoutes(app: OpenAPIHono, ports: Ports): void {
  registerSaveRoute(app, ports);
  app.openapi(retryDigestRoute, async (c) => {
    const item = await retryDigest(ports, c.req.valid("param").id);

    return item === undefined
      ? c.json({ error: NOT_FOUND }, 404)
      : c.json({ item: itemView(item) }, 200);
  });

  app.openapi(getItemStatusRoute, async (c) => {
    const item = await getListedItem(ports.db, c.req.valid("param").id);

    return item === undefined
      ? c.json({ error: NOT_FOUND }, 404)
      : c.json({ item: itemView(item) }, 200);
  });

  app.openapi(listItemsRoute, async (c) => {
    const { items, counts } = await listItems(ports.db, itemFilters(c.req.valid("query")));

    return c.json({ items: shownItems(items), counts }, 200);
  });
}
