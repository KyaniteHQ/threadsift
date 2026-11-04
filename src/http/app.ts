import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { ZodError } from "zod";

import { itemPath } from "../core/item-path.ts";
import { listItems, saveItem } from "../core/items.ts";
import type { Ports } from "../core/ports.ts";
import {
  ErrorResponseSchema,
  ItemListResponseSchema,
  SaveItemRequestSchema,
  SavedItemResponseSchema,
} from "./schemas.ts";

const jsonBody = <T extends typeof ErrorResponseSchema | typeof SavedItemResponseSchema>(
  schema: T,
  description: string,
) => ({ description, content: { "application/json": { schema } } });

const saveItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SaveItemRequestSchema } },
    },
  },
  responses: {
    201: jsonBody(
      SavedItemResponseSchema,
      "The link was new and is now an Item. `fetch` says whether its title was fetched.",
    ),
    200: jsonBody(
      SavedItemResponseSchema,
      "An Item with the same normalized URL already existed and was fetched again.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The body is not an absolute http or https URL, or its host is not globally reachable.",
    ),
  },
});

const listItemsRoute = createRoute({
  method: "get",
  path: "/api/items",
  responses: {
    200: {
      description: "Every Item, newest saved first.",
      content: { "application/json": { schema: ItemListResponseSchema } },
    },
  },
});

const REFUSED_HOST = "url: the host is not globally reachable";

function reasonOf(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}

export function createApp(ports: Ports): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json({ error: reasonOf(result.error) }, 400),
  });

  app.openapi(saveItemRoute, async (c) => {
    const { url } = c.req.valid("json");
    const saved = await saveItem(ports, url);

    if (saved.kind === "refused") {
      return c.json({ error: REFUSED_HOST, fetch: "refused" }, 400);
    }

    return c.json(
      { item: saved.item, url: itemPath(saved.item.id), fetch: saved.fetch },
      saved.created ? 201 : 200,
    );
  });

  app.openapi(listItemsRoute, async (c) => c.json({ items: await listItems(ports.db) }, 200));

  app.doc("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Threadsift", version: "1" },
  });

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }

    console.error(error);

    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
