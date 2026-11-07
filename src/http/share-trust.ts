import type { Context } from "hono";

import type { Ports } from "../core/ports.ts";
import { ownerHasSession } from "./session-cookie.ts";

function comesFromThisOrigin(c: Context): boolean {
  const origin = c.req.header("origin");

  return (
    c.req.header("sec-fetch-site") === "same-origin" &&
    origin !== undefined &&
    URL.canParse(origin) &&
    new URL(origin).host === new URL(c.req.url).host
  );
}

export async function isTrustedShare(c: Context, ports: Ports): Promise<boolean> {
  return c.req.method === "POST" && comesFromThisOrigin(c) && (await ownerHasSession(c, ports));
}
