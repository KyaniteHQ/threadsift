import { mkdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";

import { createApp } from "../../http/app.ts";
import { openDatabase } from "./database.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

const env = z
  .object({
    PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
    DATA_DIR: z.string().default(join(repositoryRoot, ".data")),
  })
  .parse(process.env);

mkdirSync(env.DATA_DIR, { recursive: true });

const database = openDatabase(
  join(env.DATA_DIR, "threadsift.db"),
  join(repositoryRoot, "migrations"),
);

const webRoot = relative(process.cwd(), join(repositoryRoot, "dist", "web"));

const app = new Hono();

app.route("/", createApp({ db: database.db }));

app.use("*", serveStatic({ root: webRoot }));

app.get("*", serveStatic({ root: webRoot, path: "index.html" }));

const server = serve({ fetch: app.fetch, port: env.PORT });

function shutdown(): void {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGTERM", shutdown);

process.once("SIGINT", shutdown);
