import type { Context } from "hono";

import { presentedToken } from "../core/access/bearer.ts";
import { callbackTaskOf } from "../core/ai/callback-credential.ts";
import type { AiTaskRow } from "../core/kernel/ai-task-state.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { jsonBody } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";
import { ownerHasSession } from "./session-cookie.ts";

const CREDENTIAL_REQUIRED = "A credential for this task is required";

const CREDENTIAL_ONLY = "Only the task's own credential may use this route";

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

export const UNSUPPORTED_TASK = "unsupported-task";

export const CREDENTIAL_REFUSALS = {
  401: jsonBody(
    ErrorResponseSchema,
    `${CREDENTIAL_REQUIRED}: the header is missing or malformed, the task does not exist, or the credential belongs to another task or to an earlier send of this task. The answer is the same for all of them.`,
  ),
  403: jsonBody(
    ErrorResponseSchema,
    `${CREDENTIAL_ONLY}: the call carries the owner's session or an agent token and no matching task credential.`,
  ),
};
