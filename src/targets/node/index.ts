import { join } from "node:path";

import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import { compress } from "hono/compress";

import { createApp } from "../../http/app.ts";
import { openDatabase } from "./database.ts";
import { REPOSITORY_ROOT, nodeEnvironment } from "./environment.ts";
import { serveContainer } from "./http-server.ts";
import { startNode } from "./ports.ts";
import { answerAfterBody } from "./unread-body.ts";
import { webRoutes } from "./web-routes.ts";

const HTTP_DRAIN_TIMEOUT_MS = 9000;

const environment = nodeEnvironment(process.env);

const database = openDatabase(
  join(environment.dataDir, "threadsift.db"),
  join(REPOSITORY_ROOT, "migrations"),
);

const app = new Hono<{ Bindings: HttpBindings }>();

app.use("*", compress());

app.use("*", answerAfterBody);

const node = await startNode(database.db, environment);

app.route("/", createApp(node.ports));

app.route("/", webRoutes(join(REPOSITORY_ROOT, "dist", "web")));

const server = serveContainer(app.fetch, environment.port);

const shutdown = async (): Promise<void> => {
  const drained = new Promise<void>((finishDrain) => {
    server.close(() => {
      finishDrain();
    });
  });
  const deadline = setTimeout(() => {
    server.closeAllConnections();
  }, HTTP_DRAIN_TIMEOUT_MS);
  try {
    await Promise.all([drained, node.stop()]);
  } finally {
    clearTimeout(deadline);
  }
  database.close();
  process.exit(0);
};

let shuttingDown: Promise<void> | undefined;

function shutdownOnce(): void {
  shuttingDown ??= shutdown();
}

process.once("SIGTERM", shutdownOnce);

process.once("SIGINT", shutdownOnce);
