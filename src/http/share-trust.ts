import type { Context } from "hono";

import { sentByOwnPage } from "../core/access/own-origin.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { senderOf } from "./sender.ts";
import { ownerHasSession } from "./session-cookie.ts";

export async function isTrustedShare(c: Context, ports: Ports): Promise<boolean> {
  return (
    c.req.method === "POST" && sentByOwnPage(senderOf(c), null) && (await ownerHasSession(c, ports))
  );
}
