import { join, relative, sep } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";

import { isDocumentPath } from "../../http/document-path.ts";
import {
  DOCUMENT_HEADERS,
  HASHED_ASSET_HEADERS,
  REVALIDATED_HEADERS,
} from "../../http/web-headers.ts";

export function webRoutes(builtWebApp: string): Hono {
  const webRoot = relative(process.cwd(), builtWebApp);
  const hashedAssetsDir = join(webRoot, "assets") + sep;
  const documentFile = join(webRoot, "index.html");

  function headersOf(path: string): Readonly<Record<string, string>> {
    if (path.startsWith(hashedAssetsDir)) return HASHED_ASSET_HEADERS;

    return path === documentFile ? DOCUMENT_HEADERS : REVALIDATED_HEADERS;
  }

  function onFound(path: string, context: Context): void {
    for (const [name, value] of Object.entries(headersOf(path))) context.header(name, value);
  }

  const files = serveStatic({ root: webRoot, onFound });
  const document = serveStatic({ root: webRoot, path: "index.html", onFound });
  const routes = new Hono();

  routes.get("/index.html", (context) => context.redirect("/", 307));

  routes.get("/_headers", (context, next) => document(context, next));

  routes.use("*", files);

  routes.get("*", (context, next) =>
    isDocumentPath(new URL(context.req.url).pathname) ? document(context, next) : next(),
  );

  return routes;
}
