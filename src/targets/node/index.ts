import { join, relative, resolve, sep } from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import { compress } from "hono/compress";
import { z } from "zod";

import { createApp } from "../../http/app.ts";
import { isDocumentPath } from "../../http/document-path.ts";
import { openDatabase } from "./database.ts";
import { startNode } from "./ports.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

const env = z
  .object({
    PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
    DATA_DIR: z.string().default(join(repositoryRoot, ".data")),
    SETUP_CODE: z.string().optional(),
    THREADSIFT_SECRET_KEY: z.string().optional(),
    PASSWORD_RESET_CODE: z.string().optional(),
    PATH: z.string().default(""),
    CLAUDE_CONFIG_DIR: z.string().optional(),
    CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
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

function onFound(path: string, context: Context): void {
  context.header("Cache-Control", path.startsWith(hashedAssetsDir) ? IMMUTABLE : REVALIDATE);
}

const files = serveStatic({ root: webRoot, onFound });

const document = serveStatic({ root: webRoot, path: "index.html", onFound });

const app = new Hono();

app.use("*", compress());

const node = await startNode(database.db, {
  dataDir: env.DATA_DIR,
  setupCode: env.SETUP_CODE,
  secretKey: env.THREADSIFT_SECRET_KEY,
  resetCode: env.PASSWORD_RESET_CODE,
  claude: {
    path: env.PATH,
    configDir: env.CLAUDE_CONFIG_DIR,
    token: env.CLAUDE_CODE_OAUTH_TOKEN,
  },
});

app.route("/", createApp(node.ports));

app.get("/index.html", (context) => context.redirect("/", 307));

app.get("/_headers", (context, next) => document(context, next));

app.use("*", files);

app.get("*", (context, next) =>
  isDocumentPath(context.req.path) ? document(context, next) : next(),
);

const server = serve({ fetch: app.fetch, port: env.PORT });

async function shutdown(): Promise<void> {
  await node.stop();
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGTERM", () => void shutdown());

process.once("SIGINT", () => void shutdown());
