import { createRoute } from "@hono/zod-openapi";

import { WIRE_ID_MAX } from "../core/contract/comment-id.ts";
import { byteSize } from "../core/contract/format.ts";
import {
  INLINE_TEXT_BYTES,
  MAX_THREAD_ANSWERS,
  MIN_ARTICLE_WORDS,
  THREAD_CONTENT_BYTES,
  X_REPLIES_MAX,
} from "../core/contract/limits.ts";
import { PAGE_BYTES } from "../core/contract/supplied-page.ts";
import { DEFAULT_CAP, ITEM_CAP, access } from "./access.ts";
import {
  PASTE_DIGEST_SCOPE,
  budgetRefusal,
  jsonBody,
  jsonRequest,
  scopeNote,
  scopeRefusal,
} from "./openapi.ts";
import { SaveItemRequestSchema, SaveRefusalSchema } from "./save-schemas.ts";
import {
  ErrorResponseSchema,
  SavedItemResponseSchema,
  UnavailableResponseSchema,
} from "./schemas.ts";

const SAVE_ITEM = access("add", { body: ITEM_CAP });

export const saveItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  middleware: SAVE_ITEM,
  description:
    `Save a link as an Item. \`content\` supplies a thread. For a Reddit link it is the Reddit JSON: one text, or 1 to ${String(MAX_THREAD_ANSWERS)} texts, the thread's \`.json\` first and then the permalink answers (\`/comments/<post>/_/<comment>.json\`) that fill its \`more\` stubs, each holding one comment at its top. For an X link it is exactly one JSON text \`{post, replies}\`: \`post\` has \`id\` (the link's status id), \`author\` (the handle without @), \`text\`, \`postedAt\` (ISO 8601 or null) and \`replies\` (the reply count X reports, or null), and each of at most ${String(X_REPLIES_MAX)} \`replies\` has \`id\`, \`parentId\` (the id of the post this reply answers), \`author\`, \`text\`, \`postedAt\` and \`likes\` (a whole number or null). When a reply answers neither the root post nor a post in \`replies\`, the Reader shows the missing parent as a Context stub above its saved replies. Every id is a digit string with no leading zero and at most ${String(WIRE_ID_MAX)} digits, and no other field is allowed. \`page\` supplies the text of a web page that the caller read in its own browser tab: \`markdown\` (the page text), \`title\`, and optionally \`author\`, \`published\` (an ISO 8601 date) and \`videos\` (the video addresses the Markdown links to). The server publishes a \`page\` like a fetched article, with the same ${String(MIN_ARTICLE_WORDS)}-word minimum, image storage and Highlight anchoring, and never fetches the page itself. A link takes \`content\` or \`page\`, not both. \`fill: true\` with \`content\` saves the thread only for a Reddit post or comment Item that holds no thread yet, which the Item's \`fillable\` shows; it answers 409 and changes nothing when the Item already holds a saved thread or no Item has the link, and 400 with \`page\` or without \`content\`. \`page\` takes no X or GitHub link, no short link (\`bit.ly\`, \`t.co\` and the other short link hosts), no Reddit share link (\`reddit.com/r/<community>/s/<code>\`) and no Reddit link that is not a post or a comment; an Item's identity is the address a short link or share link leads to, so send the page at that address, or send the link alone, which a Paste resolves; a Reddit post or comment takes it as its text and stays a Reddit Item with no comment rows, and a page under ${String(MIN_ARTICLE_WORDS)} words leaves it only its title, author and community; it answers 409 when the Item already holds a saved thread.` +
    scopeNote(SAVE_ITEM, PASTE_DIGEST_SCOPE),
  request: { body: jsonRequest(SaveItemRequestSchema) },
  responses: {
    401: jsonBody(ErrorResponseSchema, "The agent token is unknown or revoked."),
    ...scopeRefusal(SAVE_ITEM, PASTE_DIGEST_SCOPE),
    ...budgetRefusal("Nothing is saved."),
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
      `The body is not an absolute http or https URL, or its host is not globally reachable. With \`content\`: the link is not a Reddit post or comment link or an X post link, or \`content\` is not the thread of that link. For Reddit that is malformed JSON, not a post Listing and a comment Listing, a post id that is not the link's, a missing or deleted requested comment, a repeated comment id, a parent_id that does not match the tree, a text over ${byteSize(INLINE_TEXT_BYTES)}, or an answer after the first that fills no \`more\` stub of the thread. For X it is malformed JSON, a field that is missing, unknown or not in its shape, a post id that is not the link's status id, a repeated reply id, a reply with the post's id, a cycle, more than ${String(X_REPLIES_MAX)} replies, a text over ${byteSize(INLINE_TEXT_BYTES)}, a handle or id over its bound, a second text, or \`fill\` (an X thread cannot be filled). With \`page\`: the link is an X or GitHub link, a short link, a Reddit share link, or a Reddit link that is not a post or comment, or \`content\` came too; a link that cannot take a page also answers \`code: unsupported-link\`. A page with no title is not refused: it is saved, and its fetch ends with \`fetch: no-title\`. The Item is unchanged.`,
    ),
    413: jsonBody(
      ErrorResponseSchema,
      `A text of \`content\` is longer than ${byteSize(THREAD_CONTENT_BYTES)}, \`page\` is longer than ${byteSize(PAGE_BYTES)} once serialized as JSON, or the request body is longer than ${ITEM_CAP.label}. Other routes refuse a body over ${DEFAULT_CAP.label}. The Item is unchanged.`,
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "`page` for a Reddit post or comment whose Item already holds a saved thread from `content`, which is a thread header and so also a thread with no comments or with no published Digest. The saved thread stays, with its Kept comments, and nothing changes. Also `fill: true` for a link whose Item holds a saved thread in that sense or does not exist.",
    ),
    503: jsonBody(
      UnavailableResponseSchema,
      "A restore is running (`code` is `restoring`), so the link is not saved. Reads and deletes work meanwhile. Send the link again when the restore has finished.",
    ),
  },
});
