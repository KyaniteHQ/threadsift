import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { readItem } from "./item-read.ts";
import { jsonBody } from "./openapi.ts";
import { notFound } from "./refusals.ts";
import { ErrorResponseSchema, IdParamSchema, ItemDetailResponseSchema } from "./schemas.ts";

const getItemRoute = createRoute({
  method: "get",
  path: "/api/items/{id}",
  request: { params: IdParamSchema },
  responses: {
    200: jsonBody(
      ItemDetailResponseSchema,
      "The Item, with its status, reason, last fetch result, post text and posted date. `comments` holds the comments the Reader shows and the Context stubs they need, in thread order, and its `view` says which: `kept` (a Digest covers the thread and kept some), `nothing-kept` (a Digest covers it and kept none), `unfiltered` (no Digest covers it, so every comment that passes the script's first step shows; `cause` is `pending`, `failed`, `no-provider`, `not-run` or `older`), `removed` (no comment passes the script's first step and no Digest covers the thread, so `nodes` is empty) or `absent` (nothing to show); every view except `removed` and `absent` carries `count`, the comments shown out of the total. `view` is missing from an answer of a release before it, and `comments.kept` keeps counting the Kept comments. `link` is the address a Reddit link post points at, an `http` or `https` address other than the post itself, and null for any other Item or for a link post saved before the column existed, which a Paste of the thread's `.json` again fills; a release before it sends no `link`. `archive` (null for a thread the Extension or a `.json` paste sent; for a thread filled from the Arctic Shift archive, the fill time `at` in milliseconds and `withPost`, true when the post text is the archive's too and false when newer post text replaced it while the archive's comments stay readable until the next Digest publishes) and the counts `reported` (the post's own count, null for a comment link or a thread sent without one), `received` (the comments in the stored thread) and `total` (the larger of the two). `images` holds the file-route path, width and height of each stored image whose size was read, for the Reader to reserve its space. `highlights` holds the owner's Highlights, attached and unattached, with the text revisions a new Highlight must name (`POST /api/items/{id}/highlights`). `note` holds the owner's Note and its revision, which `PUT /api/items/{id}/note` must name; revision 0 and a null `body` mean no Note was saved or it was cleared.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

export function registerItemDetailRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(getItemRoute, async (c) => {
    const read = await readItem(ports, c.req.valid("param").id);

    return read === undefined ? notFound(c) : c.json(read, 200);
  });
}
