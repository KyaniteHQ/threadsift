import type { Context } from "hono";

import { ErrorResponseSchema } from "../core/contract/error-wire.ts";
import type { AiTaskRow } from "../core/kernel/ai-task-state.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { bearerOf, presentedToken } from "../features/access/core/bearer.ts";
import { callbackTaskOf } from "../features/ai/core/callback-credential.ts";
import { challengeOf } from "./bearer.ts";
import { jsonBody } from "./openapi.ts";
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

function credentialRequired(c: Context): Response {
  const authorization = c.req.header("authorization");

  const challenge = challengeOf(
    authorization !== undefined && bearerOf(authorization, "callback").kind === "token"
      ? "unknown"
      : "missing",
  );

  return c.json({ error: CREDENTIAL_REQUIRED }, 401, challenge);
}

export async function callbackTask(c: Context): Promise<AiTaskRow | Response> {
  const ports = c.get("ports");
  const task = await callbackTaskOf(ports, {
    id: c.req.param("id"),
    authorization: c.req.header("authorization"),
  });

  if (task !== null) return task;

  return (await carriesOtherAccess(c, ports)) ? credentialOnly(c) : credentialRequired(c);
}

export const UNSUPPORTED_TASK = "unsupported-task";

export const CREDENTIAL_REFUSALS = {
  401: jsonBody(
    ErrorResponseSchema,
    `${CREDENTIAL_REQUIRED}: the header is missing or malformed, the task does not exist (an \`id\` that is not a whole number counts), or the credential belongs to another task or to an earlier send of this task. The body is the same for all of them. \`WWW-Authenticate\` is \`Bearer\` when the call sent no bearer credential (no \`Authorization\` header, another scheme or an empty one) and \`Bearer error="invalid_token"\` when it sent a bearer credential that matches no task.`,
  ),
  403: jsonBody(
    ErrorResponseSchema,
    `${CREDENTIAL_ONLY}: the call carries the owner's session or an agent token and no matching task credential.`,
  ),
};
