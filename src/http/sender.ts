import type { Context } from "hono";

import type { Sender } from "../features/access/core/own-origin.ts";

export function senderOf(c: Context): Sender {
  return {
    origin: c.req.header("origin"),
    fetchSite: c.req.header("sec-fetch-site"),
    urlHost: new URL(c.req.url).host,
    headerHost: c.req.header("host"),
  };
}
