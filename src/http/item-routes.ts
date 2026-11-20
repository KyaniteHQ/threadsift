import type { OpenAPIHono } from "@hono/zod-openapi";

import { retryDigest } from "../core/digest/digest-retry.ts";
import { getListedItem } from "../core/item/item-selection.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { readItemPage } from "./item-read.ts";
import { getItemStatusRoute, listItemsRoute, retryDigestRoute } from "./item-route-spec.ts";
import { itemView } from "./item-view.ts";
import { notFound } from "./refusals.ts";

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
