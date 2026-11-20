import type { Context } from "hono";

import type { AiTaskRow } from "../core/ai-task-state.ts";
import { BEARER_CALLBACK, callbackTaskOf } from "../core/callback-credential.ts";
import type { Ports } from "../core/ports.ts";
import { verifyToken } from "../core/tokens.ts";
import { ownerHasSession } from "./session-cookie.ts";

declare module "hono" {
  interface ContextVariableMap {
    intakeRefusal: string;
  }
}

const TASK_ID = /^[1-9][0-9]{0,15}$/u;

const BEARER = /^Bearer (\S+)$/u;

export const CREDENTIAL_REQUIRED = "A credential for this task is required";

export const CREDENTIAL_ONLY = "Only the task's own credential may use this route";

interface Presented {
  readonly id: number;
  readonly value: string;
}

function presentedCredential(c: Context): Presented | null {
  const id = c.req.param("id");
  const value = BEARER_CALLBACK.exec(c.req.header("authorization") ?? "")?.[1];

  if (value === undefined || id === undefined || !TASK_ID.test(id)) return null;

  return { id: Number(id), value };
}

async function carriesOtherAccess(c: Context, ports: Ports): Promise<boolean> {
  const agentToken = BEARER.exec(c.req.header("authorization") ?? "")?.[1];

  if (agentToken !== undefined && (await verifyToken(ports, agentToken)) !== undefined) {
    return true;
  }

  return ownerHasSession(c, ports);
}

function credentialOnly(c: Context): Response {
  return c.json({ error: CREDENTIAL_ONLY }, 403);
}

export async function callbackTask(c: Context): Promise<AiTaskRow | Response> {
  const ports = c.get("ports");
  const presented = presentedCredential(c);
  const task = presented === null ? null : await callbackTaskOf(ports, presented);

  if (task !== null) return task;

  return (await carriesOtherAccess(c, ports))
    ? credentialOnly(c)
    : c.json({ error: CREDENTIAL_REQUIRED }, 401);
}
