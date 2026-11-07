import type { OpenAPIHono } from "@hono/zod-openapi";

import { changePassword, resetPassword } from "../core/owner-password.ts";
import type { Ports } from "../core/ports.ts";
import { changePasswordRoute, resetPasswordRoute } from "./access-contract.ts";
import { badPassword, locked, refuseReset, superseded, wrongCurrentPassword } from "./refusals.ts";
import { replacedSession, sessionIdOf } from "./session-cookie.ts";

export function registerPasswordRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(changePasswordRoute, async (c) => {
    const { current, password } = c.req.valid("json");
    const result = await changePassword(ports, sessionIdOf(c) ?? "", current, password);

    switch (result.kind) {
      case "changed":
        return replacedSession(c, result.session);
      case "password":
        return badPassword(c, result.length);
      case "locked":
        return locked(c, result.retryAfter);
      case "wrong":
        return wrongCurrentPassword(c);
      case "superseded":
        return superseded(c);
      default:
        return result satisfies never;
    }
  });

  app.openapi(resetPasswordRoute, async (c) => {
    const { code, password } = c.req.valid("json");
    const result = await resetPassword(ports, code, password);

    if (result.kind === "reset") {
      return c.body(null, 204);
    }

    return result.kind === "password" ? badPassword(c, result.length) : refuseReset(c, result);
  });
}
