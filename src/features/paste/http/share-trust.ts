import type { Context } from "hono";

import type { Ports } from "../../../core/kernel/ports.ts";
import { senderOf } from "../../../http/sender.ts";
import { ownerHasSession } from "../../../http/session-cookie.ts";
import { sentByOwnPage } from "../../access/core/own-origin.ts";

export async function isTrustedShare(c: Context, ports: Ports): Promise<boolean> {
  return (
    c.req.method === "POST" && sentByOwnPage(senderOf(c), null) && (await ownerHasSession(c, ports))
  );
}
