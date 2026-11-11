import { type OpenAPIHono, type z, createRoute } from "@hono/zod-openapi";

import { retryDigest } from "../core/digest-retry.ts";
import { itemFilters } from "../core/item-filters.ts";
import { ITEMS_PAGE_SIZE, parseCursor } from "../core/item-page.ts";
import { getListedItem, listItems } from "../core/item-selection.ts";
import type { Ports } from "../core/ports.ts";
import { itemView, shownItems } from "./item-view.ts";
import { jsonBody } from "./openapi.ts";
import { registerSaveRoute } from "./save-route.ts";
import {
  ErrorResponseSchema,
  IdParamSchema,
  ItemQuerySchema,
  ItemReadResponseSchema,
  ItemResponseSchema,
} from "./schemas.ts";

export const NOT_FOUND = "Not found";

const listItemsRoute = createRoute({
  method: "get",
  path: "/api/items",
  request: { query: ItemQuerySchema },
  responses: {
    200: jsonBody(
      ItemReadResponseSchema,
      `One page of at most ${String(ITEMS_PAGE_SIZE)} Items that match every filter given, newest saved first, with the highest \`id\` first among Items saved at the same time, without their post text. Read \`GET /api/items/{id}\` for the text. \`image\` is the Item's first stored image, as its file-route path and alt text, or null. \`q\` matches Items that hold every word it contains, as the start of a word, in the title, post text, Summary or Tags; \`topic\` and \`tag\` match a Topic or Tag name with case and spacing ignored. \`url\` keeps only the Item whose normalized URL is the one of the link given, so another form of the same link finds it. \`fillable\` is true for a Reddit post or comment Item that holds no saved thread. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged, with the same filters. The cursor names a position, not a record, so an Item saved or deleted between two page reads moves no later page: a new Item is newer than every cursor. \`counts\` is present only when the request has no \`cursor\`; it holds the library totals, and for each Source, Read state, Topic and Tag the number of Items a choice leaves given the other filters, over the whole library and not the page.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`source` or `read` is not one of the listed values, `url` is not an absolute http or https link, `q` is longer than 200 characters, or `cursor` is malformed: not `<saved date>.<id>`, or a number in it above 9007199254740991 (the largest safe integer). A well-formed cursor that no page gave is accepted and answers the Items after that position.",
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

export async function readItemPage(ports: Ports, query: Readonly<z.infer<typeof ItemQuerySchema>>) {
  const { cursor, ...typed } = query;

  const { items, next, counts } = await listItems(
    ports.db,
    itemFilters(typed),
    cursor === undefined ? null : parseCursor(cursor),
  );

  const shown = { items: shownItems(items), next };

  return counts === null ? shown : { ...shown, counts };
}

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
    return c.json(await readItemPage(ports, c.req.valid("query")), 200);
  });
}
