import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { ZodError } from "zod";

import { itemPath } from "../core/item-path.ts";
import { getItem, getListedItem, listItems, saveItem } from "../core/items.ts";
import type { Ports } from "../core/ports.ts";
import { registerAccessRoutes } from "./access-routes.ts";
import { guard } from "./guard.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import {
  ErrorResponseSchema,
  IdParamSchema,
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  ItemResponseSchema,
  SaveItemRequestSchema,
  SavedItemResponseSchema,
  itemView,
} from "./schemas.ts";

const saveItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  request: { body: jsonRequest(SaveItemRequestSchema) },
  responses: {
    201: jsonBody(
      SavedItemResponseSchema,
      "The link was new and is now an Item. The Item is `processing` until its fetch job ends. Read `GET /api/items/{id}/status` until `status` leaves `processing`. A short link that cannot be resolved answers with its end state.",
    ),
    200: jsonBody(
      SavedItemResponseSchema,
      "An Item with the same normalized URL already existed. It is `processing` again and has a new fetch job, unless a job was already queued or running.",
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
    200: jsonBody(
      ItemListResponseSchema,
      "Every Item, newest saved first, without its post text. Read `GET /api/items/{id}` for the text.",
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
      "The Item, with its status, reason, last fetch result, post text and posted date.",
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

const NOT_FOUND = "Not found";
const REFUSED_HOST = "url: the host is not globally reachable";

function reasonOf(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}

function registerItemRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(saveItemRoute, async (c) => {
    const { url } = c.req.valid("json");
    const saved = await saveItem(ports, url);

    if (saved.kind === "refused") {
      return c.json({ error: REFUSED_HOST, fetch: "refused" as const }, 400);
    }

    return c.json(
      { item: itemView(saved.item), url: itemPath(saved.item.id) },
      saved.created ? 201 : 200,
    );
  });

  app.openapi(getItemRoute, async (c) => {
    const item = await getItem(ports.db, c.req.valid("param").id);

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

  app.openapi(listItemsRoute, async (c) =>
    c.json({ items: (await listItems(ports.db)).map((row) => itemView(row)) }, 200),
  );
}

export function createApp(ports: Ports): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json({ error: reasonOf(result.error) }, 400),
  });

  app.use("/api/*", guard(ports));

  registerAccessRoutes(app, ports);
  registerItemRoutes(app, ports);

  app.doc("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Threadsift", version: "1" },
  });

  app.all("/api/*", (c) => c.json({ error: NOT_FOUND }, 404));

  app.onError(async (error, c) => {
    if (error instanceof HTTPException) {
      const refusal = error.getResponse();

      if (refusal.headers.get("content-type")?.includes("application/json") === true) {
        return refusal;
      }

      return c.json({ error: (await refusal.text()) || "Request refused" }, error.status);
    }

    console.error(error);

    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
