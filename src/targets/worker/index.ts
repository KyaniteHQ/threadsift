import { drizzle } from "drizzle-orm/d1";

import { createApp } from "../../http/app.ts";
import { isDocumentPath } from "../../http/document-path.ts";

interface Env {
  readonly DB: Parameters<typeof drizzle>[0];
  readonly ASSETS: Readonly<{ fetch: (input: string) => Promise<Response> }>;
}

function serveDocument(request: Request, env: Env): Response | Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && isDocumentPath(pathname)) {
    return env.ASSETS.fetch(new URL("/", request.url).href);
  }

  return new Response("404 Not Found", { status: 404 });
}

export default {
  fetch: (request: Request, env: Env): Response | Promise<Response> =>
    new URL(request.url).pathname.startsWith("/api/")
      ? createApp({ db: drizzle(env.DB) }).fetch(request)
      : serveDocument(request, env),
};
