import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { refusedIntake } from "../core/x-intake-answer.ts";
import { UNREADABLE_BODY } from "../core/x-intake-contract.ts";
import type { CallbackEnv } from "./access-steps.ts";

declare module "hono" {
  interface ContextVariableMap {
    intakeRefusal: string | undefined;
  }
}

export function refusedBody(
  c: Context,
  { error, logged }: Readonly<{ error: string; logged: string }>,
): Response {
  c.set("intakeRefusal", logged);

  return c.json({ error }, 400);
}

export const countedRefusals = createMiddleware<CallbackEnv>(async (c, next) => {
  await next();

  const unreadable = c.error instanceof HTTPException && c.error.status === 400;
  const logged = unreadable ? UNREADABLE_BODY : c.get("intakeRefusal");

  if (logged !== undefined) await refusedIntake(c.get("ports"), c.get("callbackTask"), logged);
});
