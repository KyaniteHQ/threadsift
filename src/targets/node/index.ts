import { join, resolve } from "node:path";

import { type HttpBindings, serve } from "@hono/node-server";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { z } from "zod";

import { createApp } from "../../http/app.ts";
import { openDatabase } from "./database.ts";
import { startNode } from "./ports.ts";
import { answerAfterBody } from "./unread-body.ts";
import { webRoutes } from "./web-routes.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

const env = z
  .object({
    PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
    DATA_DIR: z.string().default(join(repositoryRoot, ".data")),
    SETUP_CODE: z.string().optional(),
    THREADSIFT_SECRET_KEY: z.string().optional(),
    PASSWORD_RESET_CODE: z.string().optional(),
    THREADSIFT_PUBLIC_ORIGIN: z.string().optional(),
    THREADSIFT_FETCHERS: z.string().optional(),
    PATH: z.string().default(""),
    CLAUDE_CONFIG_DIR: z.string().optional(),
    CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
    CODEX_HOME: z.string().optional(),
  })
  .parse(process.env);

const database = openDatabase(
  join(env.DATA_DIR, "threadsift.db"),
  join(repositoryRoot, "migrations"),
);

const app = new Hono<{ Bindings: HttpBindings }>();

app.use("*", compress());

app.use("*", answerAfterBody);

const node = await startNode(database.db, {
  dataDir: env.DATA_DIR,
  setupCode: env.SETUP_CODE,
  secretKey: env.THREADSIFT_SECRET_KEY,
  resetCode: env.PASSWORD_RESET_CODE,
  publicOrigin: env.THREADSIFT_PUBLIC_ORIGIN,
  fetchers: env.THREADSIFT_FETCHERS,
  claude: {
    path: env.PATH,
    configDir: env.CLAUDE_CONFIG_DIR,
    token: env.CLAUDE_CODE_OAUTH_TOKEN,
  },
  codex: {
    path: env.PATH,
    home: env.CODEX_HOME,
    dataDir: env.DATA_DIR,
  },
});

app.route("/", createApp(node.ports));

app.route("/", webRoutes(join(repositoryRoot, "dist", "web")));

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
