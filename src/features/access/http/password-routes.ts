import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../../../core/kernel/ports.ts";
import { turnedAway } from "../../../http/refusals.ts";
import { replacedSession, sessionIdOf } from "../../../http/session-cookie.ts";
import { changePassword, resetPassword } from "../core/owner-password.ts";
import { changePasswordRoute, resetPasswordRoute } from "./access-contract.ts";

export function registerPasswordRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(changePasswordRoute, async (c) => {
    const { current, password } = c.req.valid("json");
    const result = await changePassword(ports, sessionIdOf(c) ?? "", current, password);

    return result.kind === "changed" ? replacedSession(c, result.session) : turnedAway(c, result);
  });

  app.openapi(resetPasswordRoute, async (c) => {
    const { code, password } = c.req.valid("json");
    const result = await resetPassword(ports, code, password);

    return result.kind === "reset" ? c.body(null, 204) : turnedAway(c, result);
  });
}
