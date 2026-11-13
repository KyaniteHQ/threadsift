import type { Context, MiddlewareHandler } from "hono";

import type { BotTaskRow } from "../core/bot-task-states.ts";
import { BEARER_CALLBACK, callbackTaskOf } from "../core/callback-credential.ts";
import type { Ports } from "../core/ports.ts";
import { verifyToken } from "../core/tokens.ts";
import { ownerHasSession } from "./session-cookie.ts";

declare module "hono" {
  interface ContextVariableMap {
    callbackTask: BotTaskRow;
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

export function taskCredential(ports: Ports): MiddlewareHandler {
  return async (c, next) => {
    const presented = presentedCredential(c);
    const task = presented === null ? null : await callbackTaskOf(ports, presented);

    if (task !== null) {
      c.set("callbackTask", task);

      return next();
    }

    return (await carriesOtherAccess(c, ports))
      ? c.json({ error: CREDENTIAL_ONLY }, 403)
      : c.json({ error: CREDENTIAL_REQUIRED }, 401);
  };
}
