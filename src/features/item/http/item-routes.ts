import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { SEARCH_MAX } from "../../../core/contract/item-contract.ts";
import {
  ItemReadResponseSchema,
  ItemResponseSchema,
} from "../../../core/contract/item-route-wire.ts";
import { PAGE_SIZE } from "../../../core/contract/paging.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { readItemPage } from "../../../http/item-read.ts";
import { itemView } from "../../../http/item-view.ts";
import { jsonBody, scopeNote, scopeRefusal } from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { IdParamSchema, ItemQuerySchema } from "../../../http/route-input.ts";
import { retryDigest } from "../../digest/core/digest-retry.ts";
import { getListedItem } from "../core/item-selection.ts";

const listItemsRoute = createRoute({
  method: "get",
  path: "/api/items",
  middleware: access("read"),
  request: { query: ItemQuerySchema },
  responses: {
    200: jsonBody(
      ItemReadResponseSchema,
      `One page of at most ${String(PAGE_SIZE)} Items that match every filter given, newest saved first, with the highest \`id\` first among Items saved at the same time, without their post text. Read \`GET /api/items/{id}\` for the text. \`image\` is the Item's first stored image, as its file-route path and alt text, or null. \`q\` matches Items that hold every word it contains, as the start of a word, in the title, post text, Summary or Tags; \`topic\` and \`tag\` match a Topic or Tag name with case and spacing ignored. \`url\` keeps only the Item whose normalized URL is the one of the link given, so another form of the same link finds it. \`fillable\` is true for a Reddit post or comment Item that holds no saved thread. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged, with the same filters. The cursor names a position, not a record, so an Item saved or deleted between two page reads moves no later page: a new Item is newer than every cursor. \`counts\` is present only when the request has no \`cursor\`; it holds the library totals, and for each Source, Read state, Topic and Tag the number of Items a choice leaves given the other filters, over the whole library and not the page.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `\`source\` or \`read\` is not one of the listed values, \`url\` is not an absolute http or https link, \`q\` is longer than ${String(SEARCH_MAX)} characters, or \`cursor\` is malformed: not \`<saved date>.<id>\`, or a number in it above ${String(Number.MAX_SAFE_INTEGER)} (the largest safe integer). A well-formed cursor that no page gave is accepted and answers the Items after that position.`,
    ),
  },
});

const getItemStatusRoute = createRoute({
  method: "get",
  path: "/api/items/{id}/status",
  middleware: access("read"),
  request: { params: IdParamSchema },
  responses: {
    200: jsonBody(
      ItemResponseSchema,
      "The Item as the list shows it, without its post text and posted date. Poll this until `status` leaves `processing`.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

const RETRY_DIGEST = access("digest");

const retryDigestRoute = createRoute({
  method: "post",
  path: "/api/items/{id}/digest",
  middleware: RETRY_DIGEST,
  description: `Queue a Digest again.${scopeNote(RETRY_DIGEST)}`,
  request: { params: IdParamSchema },
  responses: {
    ...scopeRefusal(RETRY_DIGEST),
    200: jsonBody(
      ItemResponseSchema,
      "Queue a Digest over stored text, or return the unchanged Item when a Digest is already open or no text exists.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

export function registerItemRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(retryDigestRoute, async (c) => {
    const item = await retryDigest(ports, c.req.valid("param").id);

    return item === undefined ? notFound(c) : c.json({ item: itemView(item) }, 200);
  });

  app.openapi(getItemStatusRoute, async (c) => {
    const item = await getListedItem(ports.db, c.req.valid("param").id);

    return item === undefined ? notFound(c) : c.json({ item: itemView(item) }, 200);
  });

  app.openapi(listItemsRoute, async (c) => {
    return c.json(await readItemPage(ports, c.req.valid("query")), 200);
  });
}
