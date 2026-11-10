import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { retryDigest } from "../core/digest-retry.ts";
import { itemFilters } from "../core/item-filters.ts";
import { itemPath } from "../core/item-path.ts";
import { getListedItem, listItems } from "../core/item-selection.ts";
import { paste } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { itemView, shownItems } from "./item-view.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import {
  ErrorResponseSchema,
  IdParamSchema,
  ItemListResponseSchema,
  ItemQuerySchema,
  ItemResponseSchema,
  SaveItemRequestSchema,
  SavedItemResponseSchema,
} from "./schemas.ts";

export const NOT_FOUND = "Not found";
const REFUSED_HOST = "url: the host is not globally reachable";

const TOO_LARGE = {
  content: "content: longer than 4 MiB",
  page: "page: longer than 1,000,000 bytes",
} as const;

const THREAD_KEPT = "page: the saved thread stays";

const UPDATING = "The library is being updated and takes no new link yet. Try again in a minute.";

const saveItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  description:
    "Save a link as an Item. `content` supplies the Reddit JSON of a thread: one text, or 1 to 101 texts, the thread's `.json` first and then the permalink answers (`/comments/<post>/_/<comment>.json`) that fill its `more` stubs, each holding one comment at its top. `page` supplies the text of a web page that the caller read in its own browser tab: `markdown` (the page text), `title`, and optionally `author`, `published` (an ISO 8601 date) and `videos` (the video addresses the Markdown links to). The server publishes a `page` like a fetched article, with the same 100-word minimum, image storage and Highlight anchoring, and never fetches the page itself. A link takes `content` or `page`, not both. `page` takes no X or GitHub link and no Reddit link that is not a post or a comment; a Reddit post or comment takes it as its text, with no comment rows.",
  request: { body: jsonRequest(SaveItemRequestSchema) },
  responses: {
    201: jsonBody(
      SavedItemResponseSchema,
      "The link was new and is now an Item. The Item is `processing` until its fetch and Digest jobs end. Read `GET /api/items/{id}/status` until `status` leaves `processing`. A short link that cannot be resolved answers with its end state.",
    ),
    200: jsonBody(
      SavedItemResponseSchema,
      "An Item with the same normalized URL already existed. It is `processing` again and has a new fetch job, unless a job was already queued or running. With `page`, the open fetch job ends first, so the new job always publishes the page.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The body is not an absolute http or https URL, or its host is not globally reachable. With `content`: the link is not a Reddit post or comment link, or `content` is not the Reddit JSON of that thread (malformed JSON, not a post Listing and a comment Listing, a post id that is not the link's, a missing or deleted requested comment, a repeated comment id, a parent_id that does not match the tree, a text over 1,000,000 bytes, or an answer after the first that fills no `more` stub of the thread). With `page`: the link is an X or GitHub link or a Reddit link that is not a post or comment, a Reddit page has no title, or `content` came too. The Item is unchanged.",
    ),
    413: jsonBody(
      ErrorResponseSchema,
      "A text of `content` is longer than 4 MiB, `page` is longer than 1,000,000 bytes once serialized as JSON, or the request body is longer than 8 MiB. Other routes refuse a body over 64 KiB. The Item is unchanged.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "`page` for a Reddit post or comment whose Item already holds comment rows from `content`. The saved thread stays, with its Kept comments, and nothing changes.",
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

function registerSaveRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(saveItemRoute, async (c) => {
    const { url, digest, content, page } = c.req.valid("json");
    const saved = await paste(ports, url, { digest, content, page });

    if (saved.kind === "too-large") {
      return c.json({ error: TOO_LARGE[saved.field] }, 413);
    }

    if (saved.kind === "refused") {
      return c.json({ error: REFUSED_HOST, fetch: "refused" as const }, 400);
    }

    if (saved.kind === "updating") {
      return c.json({ error: UPDATING }, 503);
    }

    if (saved.kind === "thread-kept") {
      return c.json({ error: THREAD_KEPT }, 409);
    }

    if (saved.kind === "invalid") {
      return c.json({ error: `${saved.field}: ${saved.reason}` }, 400);
    }

    return c.json(
      { item: itemView(saved.item), url: itemPath(saved.item.id) },
      saved.created ? 201 : 200,
    );
  });
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
    const { items, counts } = await listItems(ports.db, itemFilters(c.req.valid("query")));

    return c.json({ items: shownItems(items), counts }, 200);
  });
}
