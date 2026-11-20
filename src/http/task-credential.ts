import type { Context } from "hono";

import type { AiTaskRow } from "../core/ai-task-state.ts";
import { presentedToken } from "../core/bearer.ts";
import { callbackTaskOf } from "../core/callback-credential.ts";
import type { Ports } from "../core/ports.ts";
import { ownerHasSession } from "./session-cookie.ts";

export const CREDENTIAL_REQUIRED = "A credential for this task is required";

export const CREDENTIAL_ONLY = "Only the task's own credential may use this route";

async function carriesOtherAccess(c: Context, ports: Ports): Promise<boolean> {
  const authorization = c.req.header("authorization");

  if (
    authorization !== undefined &&
    (await presentedToken(ports, authorization, "callback")).kind === "token"
  ) {
    return true;
  }

  return ownerHasSession(c, ports);
}

function credentialOnly(c: Context): Response {
  return c.json({ error: CREDENTIAL_ONLY }, 403);
}

export async function callbackTask(c: Context): Promise<AiTaskRow | Response> {
  const ports = c.get("ports");
  const task = await callbackTaskOf(ports, {
    id: c.req.param("id"),
    authorization: c.req.header("authorization"),
  });

  if (task !== null) return task;

  return (await carriesOtherAccess(c, ports))
    ? credentialOnly(c)
    : c.json({ error: CREDENTIAL_REQUIRED }, 401);
}
