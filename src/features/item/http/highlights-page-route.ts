import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { HighlightsReadResponseSchema } from "../../../core/contract/highlights-page-wire.ts";
import { PAGE_SIZE } from "../../../core/contract/paging.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { withCounts } from "../../../http/item-read.ts";
import { jsonBody, accessNote, accessRefusals } from "../../../http/openapi.ts";
import { HighlightsQuerySchema } from "../../../http/route-input.ts";
import { highlightsPage } from "../core/highlights-page.ts";
import { itemFilters } from "../core/item-filters.ts";

const READER = access("read");

const listHighlightsRoute = createRoute({
  method: "get",
  path: "/api/highlights",
  middleware: READER,
  description: accessNote(READER),
  request: { query: HighlightsQuerySchema },
  responses: {
    ...accessRefusals(READER),
    200: jsonBody(
      HighlightsReadResponseSchema,
      `One page of at most ${String(PAGE_SIZE)} \`entries\`, newest first: a Highlight dated by when it was kept, a Note by when it was last saved, a cleared Note never. \`kind\` is \`highlight\` or \`note\`. \`id\` is the Highlight id, or the Item id for a Note. \`text\` is the quote or the Note. A Highlight carries \`found\`, false when a refresh removed its passage from the Item's text. \`item\` holds the Item's id, Source, title (the Digest's clean title, else the fetched one) and saved date. \`q\`, \`source\`, \`topic\` and \`tag\` mean what they mean in \`GET /api/items\`, except that every word of \`q\` must be in the quote or Note of the entry itself. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged. A Highlight kept between two page reads is newer than every \`next\`, so a page read from \`next\` repeats none and skips none; a Note saved again moves to the top and shows from the first page. \`counts\` is present only when the request has no \`cursor\`; it holds the library total, its number of Highlights (\`highlights\`) and of Notes (\`notes\`) and, for each Source, Topic and Tag, the number of entries a choice leaves given the search and the other filters.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `\`cursor\` is malformed: not \`<date>.<highlight or note>.<id>\`, or a number in it above ${String(Number.MAX_SAFE_INTEGER)} (the largest safe integer). A well-formed cursor that no page gave is accepted and answers the entries below that position.`,
    ),
  },
});

export function registerHighlightsPageRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listHighlightsRoute, async (c) => {
    const { cursor = null, ...typed } = c.req.valid("query");

    const { counts, ...page } = await highlightsPage(ports.db, itemFilters(typed), cursor);

    return c.json(withCounts(page, counts), 200);
  });
}
