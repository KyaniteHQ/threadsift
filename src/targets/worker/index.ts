import { drizzle } from "drizzle-orm/d1";

import { createApp } from "../../http/app.ts";

interface Env {
  readonly DB: Parameters<typeof drizzle>[0];
}

export default {
  fetch: (request: Request, env: Env): Response | Promise<Response> =>
    createApp({ db: drizzle(env.DB) }).fetch(request),
};
