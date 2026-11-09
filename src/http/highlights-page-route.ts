import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { HIGHLIGHTS_PAGE_SIZE, parseCursor } from "../core/highlights-page-contract.ts";
import { highlightsPage } from "../core/highlights-page.ts";
import { itemFilters } from "../core/item-filters.ts";
import type { Ports } from "../core/ports.ts";
import { HighlightsPageResponseSchema, HighlightsQuerySchema } from "./highlights-page-schemas.ts";
import { jsonBody } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const listHighlightsRoute = createRoute({
  method: "get",
  path: "/api/highlights",
  request: { query: HighlightsQuerySchema },
  responses: {
    200: jsonBody(
      HighlightsPageResponseSchema,
      `One page of at most ${String(HIGHLIGHTS_PAGE_SIZE)} \`entries\`, newest first: a Highlight dated by when it was kept, a Note by when it was last saved, a cleared Note never. \`kind\` is \`highlight\` or \`note\`. \`id\` is the Highlight id, or the Item id for a Note. \`text\` is the quote or the Note. A Highlight carries \`found\`, false when a refresh removed its passage from the Item's text. \`item\` holds the Item's id, Source, title (the Digest's clean title, else the fetched one) and saved date. \`q\`, \`source\`, \`topic\` and \`tag\` mean what they mean in \`GET /api/items\`, except that every word of \`q\` must be in the quote or Note of the entry itself. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged. A Highlight kept between two page reads is newer than every \`next\`, so a page read from \`next\` repeats none and skips none; a Note saved again moves to the top and shows from the first page. \`counts\` holds the library total and, for each Source, Topic and Tag, the number of entries a choice leaves given the search and the other filters.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`source` is not one of the listed values, `q` is longer than 200 characters, or `cursor` is not one that an answer gave.",
    ),
  },
});

export function registerHighlightsPageRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listHighlightsRoute, async (c) => {
    const { cursor, ...typed } = c.req.valid("query");

    const page = await highlightsPage(
      ports.db,
      itemFilters(typed),
      cursor === undefined ? null : parseCursor(cursor),
    );

    return c.json(page, 200);
  });
}
