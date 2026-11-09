import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { retryDigest } from "../core/digest-retry.ts";
import { itemFilters } from "../core/item-filters.ts";
import { itemPath } from "../core/item-path.ts";
import { getItem, getListedItem, listItems } from "../core/item-selection.ts";
import { paste } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { setReadState } from "../core/read-state.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import {
  ErrorResponseSchema,
  IdParamSchema,
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  ItemQuerySchema,
  ItemResponseSchema,
  ReadStateRequestSchema,
  SaveItemRequestSchema,
  SavedItemResponseSchema,
  itemView,
} from "./schemas.ts";

export const NOT_FOUND = "Not found";
const REFUSED_HOST = "url: the host is not globally reachable";
const CONTENT_TOO_LARGE = "content: longer than 4 MiB";
const UPDATING = "The library is being updated and takes no new link yet. Try again in a minute.";

const saveItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  request: { body: jsonRequest(SaveItemRequestSchema) },
  responses: {
    201: jsonBody(
      SavedItemResponseSchema,
      "The link was new and is now an Item. The Item is `processing` until its fetch and Digest jobs end. Read `GET /api/items/{id}/status` until `status` leaves `processing`. A short link that cannot be resolved answers with its end state.",
    ),
    200: jsonBody(
      SavedItemResponseSchema,
      "An Item with the same normalized URL already existed. It is `processing` again and has a new fetch job, unless a job was already queued or running.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The body is not an absolute http or https URL, or its host is not globally reachable. With `content`: the link is not a Reddit post or comment link, or `content` is not the Reddit JSON of that thread (malformed JSON, not a post Listing and a comment Listing, a post id that is not the link's, a missing or deleted requested comment, a repeated comment id, a parent_id that does not match the tree, or a text over 1,000,000 bytes). The Item is unchanged.",
    ),
    413: jsonBody(
      ErrorResponseSchema,
      "`content` is longer than 4 MiB, or the request body is longer than 8 MiB. Other routes refuse a body over 64 KiB. The Item is unchanged.",
    ),
    503: jsonBody(
      ErrorResponseSchema,
      "A new release is rewriting the stored Items and has not finished, so the link is not saved. Reads and deletes work meanwhile. Send the link again after a minute.",
    ),
  },
});

const listItemsRoute = createRoute({
  method: "get",
  path: "/api/items",
  request: { query: ItemQuerySchema },
  responses: {
    200: jsonBody(
      ItemListResponseSchema,
      "The Items that match every filter given, newest saved first, without their post text. Read `GET /api/items/{id}` for the text. `image` is the Item's first stored image, as its file-route path and alt text, or null. `q` matches Items that hold every word it contains, as the start of a word, in the title, post text, Summary or Tags; `topic` and `tag` match a Topic or Tag name with case and spacing ignored. `counts` holds the library totals, and for each Source, Read state, Topic and Tag the number of Items a choice leaves given the other filters.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`source` or `read` is not one of the listed values, or `q` is longer than 200 characters.",
    ),
  },
});

const getItemRoute = createRoute({
  method: "get",
  path: "/api/items/{id}",
  request: { params: IdParamSchema },
  responses: {
    200: jsonBody(
      ItemDetailResponseSchema,
      "The Item, with its status, reason, last fetch result, post text and posted date. `comments` holds the Kept comments of the stored Digest and the Context stubs they need, in thread order, with three separate counts: `reported` (the post's own count, null for a comment link or a thread sent without one), `received` (the comments in the stored thread) and `kept`. `images` holds the file-route path, width and height of each stored image whose size was read, for the Reader to reserve its space. `highlights` holds the owner's Highlights, attached and unattached, with the text revisions a new Highlight must name (`POST /api/items/{id}/highlights`).",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
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

function registerReadStateRoute(app: OpenAPIHono, ports: Ports): void {
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

function registerSaveRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(saveItemRoute, async (c) => {
    const { url, digest, content } = c.req.valid("json");
    const saved = await paste(ports, url, { digest, content });

    if (saved.kind === "too-large") {
      return c.json({ error: CONTENT_TOO_LARGE }, 413);
    }

    if (saved.kind === "refused") {
      return c.json({ error: REFUSED_HOST, fetch: "refused" as const }, 400);
    }

    if (saved.kind === "updating") {
      return c.json({ error: UPDATING }, 503);
    }

    if (saved.kind === "invalid") {
      return c.json({ error: `content: ${saved.reason}` }, 400);
    }

    return c.json(
      { item: itemView(saved.item), url: itemPath(saved.item.id) },
      saved.created ? 201 : 200,
    );
  });
}

export function registerItemRoutes(app: OpenAPIHono, ports: Ports): void {
  registerReadStateRoute(app, ports);
  registerSaveRoute(app, ports);
  app.openapi(retryDigestRoute, async (c) => {
    const item = await retryDigest(ports, c.req.valid("param").id);

    return item === undefined
      ? c.json({ error: NOT_FOUND }, 404)
      : c.json({ item: itemView(item) }, 200);
  });
  app.openapi(getItemRoute, async (c) => {
    const item = await getItem(ports, c.req.valid("param").id);

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

    return c.json({ items: items.map((row) => itemView(row)), counts }, 200);
  });
}
