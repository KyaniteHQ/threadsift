import { join, relative, sep } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";

import { isDocumentPath } from "../../http/document-path.ts";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

export function webRoutes(builtWebApp: string): Hono {
  const webRoot = relative(process.cwd(), builtWebApp);
  const hashedAssetsDir = join(webRoot, "assets") + sep;

  function onFound(path: string, context: Context): void {
    context.header("Cache-Control", path.startsWith(hashedAssetsDir) ? IMMUTABLE : REVALIDATE);
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
