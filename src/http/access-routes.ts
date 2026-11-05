import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";

import { checkSetupCode, hasOwner, login, setUpOwner } from "../core/owner.ts";
import type { Ports } from "../core/ports.ts";
import { endSession, type StartedSession } from "../core/sessions.ts";
import { checkConfiguredCode } from "../core/setup-code.ts";
import { createToken, listTokens, revokeToken } from "../core/tokens.ts";
import {
  createTokenRoute,
  listTokensRoute,
  loginRoute,
  logoutRoute,
  revokeTokenRoute,
  sessionRoute,
  setupCodeRoute,
  setupRoute,
} from "./access-contract.ts";
import { badPassword, locked, refuse, wrongPassword } from "./refusals.ts";
import { clearSession, ownerHasSession, sendSession, sessionIdOf } from "./session-cookie.ts";

function startedSession(c: Context, session: StartedSession) {
  sendSession(c, session.id, session.maxAge);

  return c.body(null, 204);
}

function registerSetupRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(sessionRoute, async (c) => {
    if (await ownerHasSession(c, ports)) {
      return c.json({ state: "signed-in" } as const, 200);
    }

    if (await hasOwner(ports.db)) {
      return c.json({ state: "signed-out" } as const, 200);
    }

    return c.json(
      { state: "setup", code: checkConfiguredCode(ports.setupCode).status } as const,
      200,
    );
  });

  app.openapi(setupCodeRoute, async (c) => {
    const block = await checkSetupCode(ports, c.req.valid("json").code);

    return block === null ? c.body(null, 204) : refuse(c, block);
  });

  app.openapi(setupRoute, async (c) => {
    const { code, password } = c.req.valid("json");
    const result = await setUpOwner(ports, code, password);

    if (result.kind === "created") {
      return startedSession(c, result.session);
    }

    return result.kind === "password" ? badPassword(c, result.length) : refuse(c, result);
  });
}

function registerSessionRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(loginRoute, async (c) => {
    const result = await login(ports, c.req.valid("json").password);

    if (result.kind === "signed-in") {
      return startedSession(c, result.session);
    }

    return result.kind === "locked" ? locked(c, result.retryAfter) : wrongPassword(c);
  });

  app.openapi(logoutRoute, async (c) => {
    const id = sessionIdOf(c);

    if (id !== undefined) {
      await endSession(ports, id);
    }

    clearSession(c);

    return c.body(null, 204);
  });
}

function registerTokenRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(createTokenRoute, async (c) =>
    c.json(await createToken(ports, c.req.valid("json").name), 201),
  );

  app.openapi(listTokensRoute, async (c) => c.json({ tokens: await listTokens(ports) }, 200));

  app.openapi(revokeTokenRoute, async (c) =>
    (await revokeToken(ports, c.req.valid("param").id))
      ? c.body(null, 204)
      : c.json({ error: "No such token" }, 404),
  );
}

export function registerAccessRoutes(app: OpenAPIHono, ports: Ports): void {
  registerSetupRoutes(app, ports);
  registerSessionRoutes(app, ports);
  registerTokenRoutes(app, ports);
}
