import { drizzle } from "drizzle-orm/d1";

import { createApp } from "../../http/app.ts";
import { isApiPath, isDocumentPath } from "../../http/document-path.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { workerNetwork } from "./network.ts";

interface Env {
  readonly DB: Parameters<typeof drizzle>[0];
  readonly SETUP_CODE?: string;
  readonly ASSETS: Readonly<{ fetch: (input: Request) => Promise<Response> }>;
}

let app: ReturnType<typeof createApp> | undefined;

function apiApp(env: Env): ReturnType<typeof createApp> {
  app ??= createApp({
    db: drizzle(env.DB),
    network: workerNetwork,
    crypto: nodeCrypto,
    setupCode: env.SETUP_CODE,
  });

  return app;
}

function serveDocument(request: Request, env: Env): Response | Promise<Response> {
  const { pathname } = new URL(request.url);
  const readsPage = request.method === "GET" || request.method === "HEAD";

  if (readsPage && isDocumentPath(pathname)) {
    return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
  }

  return new Response("404 Not Found", { status: 404 });
}

export default {
  fetch: (request: Request, env: Env): Response | Promise<Response> =>
    isApiPath(new URL(request.url).pathname)
      ? apiApp(env).fetch(request)
      : serveDocument(request, env),
};
