import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { paste } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { savedView } from "./item-view.ts";
import {
  PASTE_DIGEST_SCOPE,
  budgetRefusal,
  jsonBody,
  jsonRequest,
  scopeNote,
  scopeRefusal,
} from "./openapi.ts";
import { REFUSED_HOST, UPDATING, budgetSpent } from "./refusals.ts";
import { SaveItemRequestSchema, SaveRefusalSchema } from "./save-schemas.ts";
import { ErrorResponseSchema, SavedItemResponseSchema } from "./schemas.ts";
import { callerOf, requirePasteScopes } from "./token-scopes.ts";

const TOO_LARGE = {
  content: "content: longer than 4 MiB",
  page: "page: longer than 1,000,000 bytes",
} as const;

const THREAD_KEPT = "page: the saved thread stays";

const NOT_WAITING = "fill: no Item with this link is waiting for its thread";

const saveItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  description:
    "Save a link as an Item. `content` supplies a thread. For a Reddit link it is the Reddit JSON: one text, or 1 to 101 texts, the thread's `.json` first and then the permalink answers (`/comments/<post>/_/<comment>.json`) that fill its `more` stubs, each holding one comment at its top. For an X link it is exactly one JSON text `{post, replies}`: `post` has `id` (the link's status id), `author` (the handle without @), `text`, `postedAt` (ISO 8601 or null) and `replies` (the reply count X reports, or null), and each of at most 500 `replies` has `id`, `parentId` (the post's id or another reply's id), `author`, `text`, `postedAt` and `likes` (a whole number or null); every id is a digit string with no leading zero and at most 29 digits, and no other field is allowed. `page` supplies the text of a web page that the caller read in its own browser tab: `markdown` (the page text), `title`, and optionally `author`, `published` (an ISO 8601 date) and `videos` (the video addresses the Markdown links to). The server publishes a `page` like a fetched article, with the same 100-word minimum, image storage and Highlight anchoring, and never fetches the page itself. A link takes `content` or `page`, not both. `fill: true` with `content` saves the thread only for a Reddit post or comment Item that holds no thread yet, which the Item's `fillable` shows; it answers 409 and changes nothing when the Item already holds a saved thread or no Item has the link, and 400 with `page` or without `content`. `page` takes no X or GitHub link and no Reddit link that is not a post or a comment; a Reddit post or comment takes it as its text and stays a Reddit Item with no comment rows, and a page under 100 words leaves it only its title, author and community; it answers 409 when the Item already holds a saved thread." +
    scopeNote("POST", "/api/items", PASTE_DIGEST_SCOPE),
  request: { body: jsonRequest(SaveItemRequestSchema) },
  responses: {
    ...scopeRefusal("POST", "/api/items", PASTE_DIGEST_SCOPE),
    ...budgetRefusal,
    201: jsonBody(
      SavedItemResponseSchema,
      "The link was new and is now an Item. The Item is `processing` until its fetch and Digest jobs end. Read `GET /api/items/{id}/status` until `status` leaves `processing`. A short link that cannot be resolved answers with its end state.",
    ),
    200: jsonBody(
      SavedItemResponseSchema,
      "An Item with the same normalized URL already existed. It is `processing` again and has a new fetch job, unless a job was already queued or running. With `page`, the open fetch job ends first, so the new job always publishes the page.",
    ),
    400: jsonBody(
      SaveRefusalSchema,
      "The body is not an absolute http or https URL, or its host is not globally reachable. With `content`: the link is not a Reddit post or comment link or an X post link, or `content` is not the thread of that link. For Reddit that is malformed JSON, not a post Listing and a comment Listing, a post id that is not the link's, a missing or deleted requested comment, a repeated comment id, a parent_id that does not match the tree, a text over 1,000,000 bytes, or an answer after the first that fills no `more` stub of the thread. For X it is malformed JSON, a field that is missing, unknown or not in its shape, a post id that is not the link's status id, a repeated reply id, a reply with the post's id, a `parentId` that is not the post or a reply, a cycle, more than 500 replies, a text over 1,000,000 bytes, a handle or id over its bound, a second text, or `fill` (an X thread cannot be filled). With `page`: the link is an X or GitHub link or a Reddit link that is not a post or comment, or `content` came too; a link that cannot take a page also answers `code: unsupported-link`. A page with no title is not refused: it is saved, and its fetch ends with `fetch: no-title`. The Item is unchanged.",
    ),
    413: jsonBody(
      ErrorResponseSchema,
      "A text of `content` is longer than 4 MiB, `page` is longer than 1,000,000 bytes once serialized as JSON, or the request body is longer than 8 MiB. Other routes refuse a body over 64 KiB. The Item is unchanged.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "`page` for a Reddit post or comment whose Item already holds a saved thread from `content`, which is a thread header and so also a thread with no comments or with no published Digest. The saved thread stays, with its Kept comments, and nothing changes. Also `fill: true` for a link whose Item holds a saved thread in that sense or does not exist.",
    ),
    503: jsonBody(
      ErrorResponseSchema,
      "A new release is rewriting the stored Items and has not finished, so the link is not saved. Reads and deletes work meanwhile. Send the link again after a minute.",
    ),
  },
});

export function registerSaveRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(saveItemRoute, async (c) => {
    const { url, digest, content, page, fill } = c.req.valid("json");

    requirePasteScopes(c, digest !== undefined);

    const saved = await paste(ports, url, callerOf(c), { digest, content, page, fill });

    if (saved.kind === "budget-spent") return budgetSpent(c, saved);

    if (saved.kind === "too-large") {
      return c.json({ error: TOO_LARGE[saved.field] }, 413);
    }

    if (saved.kind === "refused") {
      return c.json({ error: REFUSED_HOST, fetch: "refused" as const }, 400);
    }

    if (saved.kind === "updating") {
      return c.json({ error: UPDATING }, 503);
    }

    if (saved.kind === "not-waiting") {
      return c.json({ error: NOT_WAITING }, 409);
    }

    if (saved.kind === "thread-kept") {
      return c.json({ error: THREAD_KEPT }, 409);
    }

    if (saved.kind === "invalid") {
      return c.json({ error: `${saved.field}: ${saved.reason}`, code: saved.code }, 400);
    }

    return c.json(savedView(saved.item), saved.created ? 201 : 200);
  });
}
