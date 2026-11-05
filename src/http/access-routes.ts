import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";

import { checkSetupCode, hasOwner, login, setUpOwner, setupCodeStatus } from "../core/owner.ts";
import type { SetupBlock } from "../core/owner.ts";
import type { Ports } from "../core/ports.ts";
import { endSession } from "../core/sessions.ts";
import { createToken, listTokens, revokeToken } from "../core/tokens.ts";
import {
  CreateTokenRequestSchema,
  CreatedTokenResponseSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  SessionStateSchema,
  SetupCodeRequestSchema,
  SetupRequestSchema,
  TokenIdParamSchema,
  TokenListResponseSchema,
} from "./schemas.ts";
import { clearSession, ownerHasSession, sendSession, sessionIdOf } from "./session-cookie.ts";

const errorBody = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorResponseSchema } },
});

const noContent = (description: string) => ({ description });

const SETUP_ERRORS = {
  401: errorBody("The setup code is wrong."),
  409: errorBody("An owner exists already."),
  429: errorBody("Too many wrong tries; `Retry-After` gives the seconds to wait."),
  503: errorBody("The Instance has no usable setup code; `setup` says why."),
};

const sessionRoute = createRoute({
  method: "get",
  path: "/api/session",
  responses: {
    200: {
      description:
        "`setup` while no owner exists, with `code` saying whether the Instance has a usable setup code (`set`, `missing` or `short`), else `signed-in` or `signed-out`.",
      content: { "application/json": { schema: SessionStateSchema } },
    },
  },
});

const setupCodeRoute = createRoute({
  method: "post",
  path: "/api/setup/code",
  request: {
    body: { required: true, content: { "application/json": { schema: SetupCodeRequestSchema } } },
  },
  responses: { 204: noContent("The setup code is right."), ...SETUP_ERRORS },
});

const setupRoute = createRoute({
  method: "post",
  path: "/api/setup",
  request: {
    body: { required: true, content: { "application/json": { schema: SetupRequestSchema } } },
  },
  responses: {
    204: noContent("The owner exists and the response sets the session cookie."),
    400: errorBody("The password is shorter than 15 or longer than 1,024 characters."),
    ...SETUP_ERRORS,
  },
});

const loginRoute = createRoute({
  method: "post",
  path: "/api/login",
  request: {
    body: { required: true, content: { "application/json": { schema: LoginRequestSchema } } },
  },
  responses: {
    204: noContent("The password is right and the response sets the session cookie."),
    401: errorBody("The password is wrong."),
    429: errorBody("Too many wrong tries; `Retry-After` gives the seconds to wait."),
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/api/logout",
  responses: { 204: noContent("The session is deleted and the cookie cleared.") },
});

const createTokenRoute = createRoute({
  method: "post",
  path: "/api/tokens",
  request: {
    body: { required: true, content: { "application/json": { schema: CreateTokenRequestSchema } } },
  },
  responses: {
    201: {
      description: "The token and its value, which is never shown again.",
      content: { "application/json": { schema: CreatedTokenResponseSchema } },
    },
  },
});

const listTokensRoute = createRoute({
  method: "get",
  path: "/api/tokens",
  responses: {
    200: {
      description: "Every token, newest first, without its value.",
      content: { "application/json": { schema: TokenListResponseSchema } },
    },
  },
});

const revokeTokenRoute = createRoute({
  method: "delete",
  path: "/api/tokens/{id}",
  request: { params: TokenIdParamSchema },
  responses: {
    204: noContent("The token is revoked and its next use gets 401."),
    404: errorBody("No such token."),
  },
});

const WRONG_CODE = "The setup code is wrong";
const WRONG_PASSWORD = "The password is wrong";

const PASSWORD_LENGTH = {
  short: "The password must have at least 15 characters",
  long: "The password must have at most 1,024 characters",
} as const;

const LOCKED = "Too many wrong tries";

const UNAVAILABLE = {
  missing: "This Instance has no setup code",
  short: "The setup code is shorter than 16 characters, so it is not used",
} as const;

function refuse(c: Context, block: SetupBlock) {
  switch (block.kind) {
    case "owner-exists":
      return c.json({ error: "An owner exists already" }, 409);
    case "unavailable":
      return c.json({ error: UNAVAILABLE[block.reason], setup: block.reason }, 503);
    case "locked":
      c.header("Retry-After", String(block.retryAfter));

      return c.json({ error: LOCKED }, 429);
    case "wrong":
      return c.json({ error: WRONG_CODE }, 401);
    default:
      return block satisfies never;
  }
}

function registerSetupRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(sessionRoute, async (c) => {
    if (!(await hasOwner(ports.db))) {
      return c.json({ state: "setup", code: setupCodeStatus(ports) } as const, 200);
    }

    const state = (await ownerHasSession(c, ports)) ? "signed-in" : "signed-out";

    return c.json({ state } as const, 200);
  });

  app.openapi(setupCodeRoute, async (c) => {
    const block = await checkSetupCode(ports, c.req.valid("json").code);

    return block === null ? c.body(null, 204) : refuse(c, block);
  });

  app.openapi(setupRoute, async (c) => {
    const { code, password } = c.req.valid("json");
    const result = await setUpOwner(ports, code, password);

    if (result.kind === "created") {
      sendSession(c, result.session.id, result.session.maxAge);

      return c.body(null, 204);
    }

    if (result.kind === "password") {
      return c.json({ error: PASSWORD_LENGTH[result.length], password: result.length }, 400);
    }

    return refuse(c, result);
  });
}

function registerSessionRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(loginRoute, async (c) => {
    const result = await login(ports, c.req.valid("json").password);

    if (result.kind === "signed-in") {
      sendSession(c, result.session.id, result.session.maxAge);

      return c.body(null, 204);
    }

    if (result.kind === "locked") {
      c.header("Retry-After", String(result.retryAfter));

      return c.json({ error: LOCKED }, 429);
    }

    return c.json({ error: WRONG_PASSWORD }, 401);
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
