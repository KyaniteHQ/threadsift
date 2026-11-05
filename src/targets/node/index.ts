import { join, relative, resolve, sep } from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { z } from "zod";

import { createApp } from "../../http/app.ts";
import { isDocumentPath } from "../../http/document-path.ts";
import { openDatabase } from "./database.ts";
import { nodePorts } from "./ports.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

const env = z
  .object({
    PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
    DATA_DIR: z.string().default(join(repositoryRoot, ".data")),
    SETUP_CODE: z.string().optional(),
  })
  .parse(process.env);

const database = openDatabase(
  join(env.DATA_DIR, "threadsift.db"),
  join(repositoryRoot, "migrations"),
);

const webRoot = relative(process.cwd(), join(repositoryRoot, "dist", "web"));

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";
const hashedAssetsDir = join(webRoot, "assets") + sep;

function cacheControlOf(path: string): string {
  return path.startsWith(hashedAssetsDir) ? IMMUTABLE : REVALIDATE;
}

const files = serveStatic({
  root: webRoot,
  onFound: (path, context) => {
    context.header("Cache-Control", cacheControlOf(path));
  },
});

const document = serveStatic({
  root: webRoot,
  path: "index.html",
  onFound: (path, context) => {
    context.header("Cache-Control", cacheControlOf(path));
  },
});

const app = new Hono();

app.use("*", compress());

app.route("/", createApp(await nodePorts(database.db, env.SETUP_CODE)));

app.get("/index.html", (context) => context.redirect("/", 307));

app.get("/_headers", (context, next) => document(context, next));

app.use("*", files);

app.get("*", (context, next) =>
  isDocumentPath(context.req.path) ? document(context, next) : next(),
);

const server = serve({ fetch: app.fetch, port: env.PORT });

function shutdown(): void {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGTERM", shutdown);

process.once("SIGINT", shutdown);
