import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../../../core/kernel/ports.ts";
import { turnedAway } from "../../../http/refusals.ts";
import {
  clearSession,
  ownerHasSession,
  sessionIdOf,
  startedSession,
} from "../../../http/session-cookie.ts";
import { anonymousState, checkSetupCode, login, setUpOwner } from "../core/owner.ts";
import { endSession } from "../core/sessions.ts";
import { changeBudget, createToken, listTokens, revokeToken } from "../core/tokens.ts";
import {
  changeBudgetRoute,
  createTokenRoute,
  listTokensRoute,
  loginRoute,
  logoutRoute,
  revokeTokenRoute,
  sessionRoute,
  setupCodeRoute,
  setupRoute,
} from "./access-contract.ts";
import { registerPasswordRoutes } from "./password-routes.ts";

function registerSetupRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(sessionRoute, async (c) =>
    (await ownerHasSession(c, ports))
      ? c.json({ state: "signed-in" } as const, 200)
      : c.json(await anonymousState(ports), 200),
  );

  app.openapi(setupCodeRoute, async (c) => {
    const block = await checkSetupCode(ports, c.req.valid("json").code);

    return block === null ? c.body(null, 204) : turnedAway(c, block);
  });

  app.openapi(setupRoute, async (c) => {
    const { code, password } = c.req.valid("json");
    const result = await setUpOwner(ports, code, password);

    return result.kind === "created" ? startedSession(c, result.session) : turnedAway(c, result);
  });
}

function registerSessionRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(loginRoute, async (c) => {
    const result = await login(ports, c.req.valid("json").password);

    return result.kind === "signed-in" ? startedSession(c, result.session) : turnedAway(c, result);
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
  app.openapi(createTokenRoute, async (c) => {
    const { name, scopes, dailyBudget } = c.req.valid("json");

    return c.json(await createToken(ports, name, scopes, dailyBudget), 201);
  });

  app.openapi(changeBudgetRoute, async (c) => {
    const token = await changeBudget(
      ports,
      c.req.valid("param").id,
      c.req.valid("json").dailyBudget,
    );

    return token === undefined ? c.json({ error: "No such token" }, 404) : c.json({ token }, 200);
  });

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
  registerPasswordRoutes(app, ports);
  registerTokenRoutes(app, ports);
}
