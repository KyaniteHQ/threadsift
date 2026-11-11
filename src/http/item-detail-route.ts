import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { getItem } from "../core/item-detail.ts";
import type { Ports } from "../core/ports.ts";
import { NOT_FOUND } from "./item-routes.ts";
import { itemView } from "./item-view.ts";
import { jsonBody } from "./openapi.ts";
import { ErrorResponseSchema, IdParamSchema, ItemDetailResponseSchema } from "./schemas.ts";

const getItemRoute = createRoute({
  method: "get",
  path: "/api/items/{id}",
  request: { params: IdParamSchema },
  responses: {
    200: jsonBody(
      ItemDetailResponseSchema,
      "The Item, with its status, reason, last fetch result, post text and posted date. `comments` holds the Kept comments of the stored Digest and the Context stubs they need, in thread order, `archive` (null for a thread the Extension or a `.json` paste sent; for a thread filled from the Arctic Shift archive, the fill time `at` in milliseconds and `withPost`, true when the post text is the archive's too and false when newer post text replaced it while the archive's comments stay readable until the next Digest publishes) and three separate counts: `reported` (the post's own count, null for a comment link or a thread sent without one), `received` (the comments in the stored thread) and `kept`. `images` holds the file-route path, width and height of each stored image whose size was read, for the Reader to reserve its space. `highlights` holds the owner's Highlights, attached and unattached, with the text revisions a new Highlight must name (`POST /api/items/{id}/highlights`). `note` holds the owner's Note and its revision, which `PUT /api/items/{id}/note` must name; revision 0 and a null `body` mean no Note was saved or it was cleared.",
    ),
    404: jsonBody(ErrorResponseSchema, "No Item has this id."),
  },
});

export async function readItem(ports: Ports, id: number) {
  const item = await getItem(ports, id);

  return item === undefined ? undefined : { item: itemView(item) };
}

export function registerItemDetailRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(getItemRoute, async (c) => {
    const read = await readItem(ports, c.req.valid("param").id);

    return read === undefined ? c.json({ error: NOT_FOUND }, 404) : c.json(read, 200);
  });
}
